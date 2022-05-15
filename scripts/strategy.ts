import { HardhatRuntimeEnvironment } from "hardhat/types"
import { currentServerTimeStamp } from "./crabada"

export interface IApiMine{
    start_time: number,
    team_id: number,
    process: {
        action: string
    }[]
}

export interface ITeamDefenseAnalisys{
    defended: number,
    notDefended: number,
}

export interface ITeamDefenseAnalisysByTeamId{
    [teamId: string]: ITeamDefenseAnalisys,
}

export interface ITeamsThatPlayToLooseByTeamId{
    [teamId: number]: boolean,
}

export const getTeamsThatPlayToLooseByTeamIdUsingApi = async (hre: HardhatRuntimeEnvironment,
    fromTimestamp: number=currentServerTimeStamp()-2*24*60*60,
    toTimestamp: number=currentServerTimeStamp()-30*60-1): Promise<ITeamsThatPlayToLooseByTeamId> => {

    const limit = 100
    let page = 1

    const teamsAnalisys: ITeamDefenseAnalisysByTeamId = {}

    await new Promise((resolve) => {

        const queryMinesInterval = setInterval( async () => {

            // TODO https://idle-game-api.crabada.com/public/idle/mines?page=1&limit=100
            const mines: IApiMine[] = await hre.crabada.api.getMines(page, limit)
    
            const minesFromTimestamp = mines
                .filter( mine => mine.start_time >= fromTimestamp)
    
            if (minesFromTimestamp.length == 0){
                clearInterval(queryMinesInterval)
                resolve(undefined)
                return
            }
    
            const minesBetweenPeriod = minesFromTimestamp
                .filter( mine => mine.start_time <= toTimestamp)
    
            minesBetweenPeriod.forEach( mine => {
    
                const teamAnalisys: ITeamDefenseAnalisys = teamsAnalisys[mine.team_id] || {
                    defended: 0,
                    notDefended: 0
                }
    
                const actions = mine.process.map(step => step.action)

                if (actions.includes('attack')){
                    if (actions.includes('reinforce-defense'))
                        teamAnalisys.defended += 1
                    else
                        teamAnalisys.notDefended += 1 
                }
    
                teamsAnalisys[mine.team_id] = teamAnalisys
            
            })
                
        }, 500)

    })

    const result: ITeamsThatPlayToLooseByTeamId = {}

    Object.keys(teamsAnalisys).forEach( teamId => {
        const teamAnalisys = teamsAnalisys[teamId]
        if ( teamAnalisys.defended == 0 && teamAnalisys.notDefended > 0 ){
            result[teamId] = true
        }
    })

    console.log('Teams that play to loose', Object.keys(result).length);

    return result

}