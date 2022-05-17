import { task, types } from "hardhat/config";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { currentServerTimeStamp } from "../scripts/crabada";
import { collections, connectToDatabase } from "../scripts/srv/database";
import { IApiMine } from "../scripts/strategy";
import { delay } from "./crabada";

interface IDbStatus{
    saveminesLasPage?: number
}

const dbGetStatus = async(): Promise<IDbStatus> => {
    if (!collections.status)
        return undefined
    const result = await collections.status.findOne()
    return result as unknown as IDbStatus
}

const dbUpdateStatus = async (data: IDbStatus) => {
    const query = { };
    const update = { $set: data};
    const options = { upsert: true };
    collections.status.updateOne(query, update, options);
}

const isMineAlreadyExists = async (mines: IApiMine[]): Promise<boolean> => {
    const mineThatAlreadyExist = (await collections.mines
        .findOne({ "game_id" : { $in : mines.map( m => m.game_id) } })
    )
    return Boolean(mineThatAlreadyExist)
}

const dbSaveMines = async (mines: IApiMine[]): Promise<void> => {
    await collections.mines.bulkWrite(mines.map( mine => ({
        updateOne: {
            filter: { "game_id": mine.game_id },
            update: { $set: mine },
            upsert: true,
        }
    })))
}

task(
    "savemines",
    "Read mines from API and save them to the database.",
    async ({ from, continueprocess }: { from: number, continueprocess: boolean }, 
        hre: HardhatRuntimeEnvironment) => {

        await connectToDatabase()

        const limit = 100
        let page = 0

        if (continueprocess){
            const status = await dbGetStatus()
            page = (status && status.saveminesLasPage) ? status.saveminesLasPage-1 : 0
        }

        const maxIterations = 50
        let iterations = 0

        const gameIdsFromPreviousPage: number[] = []

        while (true){

            await delay(500)

            page++
            iterations++

            continueprocess && dbUpdateStatus({saveminesLasPage: page})

            console.log('Reading page', page);
            const mines: IApiMine[] = await hre.crabada.api.getClosedMines(page, limit)

            let mineAlreadyExists = false
            if (!continueprocess){
                mineAlreadyExists = await isMineAlreadyExists(
                    // To verify this, are excluded the mines of the previous page.
                    mines.filter( m => !gameIdsFromPreviousPage.includes(m.game_id))
                )
            }

            mines.forEach( m => gameIdsFromPreviousPage.push(m.game_id) )

            await dbSaveMines(mines)

            if (!continueprocess && mineAlreadyExists){
                break
            }

            const minesFromTimestamp = mines
                .filter( mine => mine.start_time >= from)

            // In case we arrive to the oldest possible mine...
            if (minesFromTimestamp.length == 0){
                // ...we begin again to 
                page = 0
            }

            if (iterations > maxIterations){
                break
            }

        }

    })
    .addOptionalParam('from', 'From block timestamp', currentServerTimeStamp()-2*24*60*60, types.int)
    .addOptionalParam('continueprocess', 'Begin reading from last processed page.', false, types.boolean)
