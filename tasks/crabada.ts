import { task } from "hardhat/config";

import { formatEther, formatUnits, parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { attachAttackRouter, baseFee, compareBigNumbers, compareBigNumbersDescending, currentBlockTimeStamp, gasPrice, getCrabadaContracts, getPercentualStepDistribution, getTeamsBattlePoint, getTeamsThatPlayToLooseByTeamId, isTeamLocked, loot, mineStep, ONE_GWEI, queryFilterByPage, reinforce, settleGame, StepMaxValuesByPercentage, TeamInfoByTeam, updateTeamsThatWereChaged } from "../scripts/crabada";
import { types } from "hardhat/config"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract, ethers } from "ethers";
import { AccountConfig, CONFIG_BY_NODE_ID, looter1, looter2, main, NodeConfig, player1, player2, player3, player4, player5, player6,  } from "../config/nodes";

import "./player"
import "./captcha"
import { deposit, logTransactionAndWait, withdraw, withdrawTeam } from "../test/utils";
import { ClassNameByCrabada, classNameFromDna, LOOTERS_FACTION, TeamBattlePoints, TeamFaction } from "../scripts/teambp";
import { assert } from "console";
import { PLAYER_TUS_RESERVE } from "./player";

task("basefee", "Get the base fee", async (args, hre): Promise<void> => {
    console.log(formatUnits(await baseFee(hre), 9))
})
  
task("gasprice", "Get the base fee", async (args, hre): Promise<void> => {
    console.log(formatUnits(await gasPrice(hre), 9))
})

export const getSigner = async (hre: HardhatRuntimeEnvironment, testaccount?: string, signerIndex: number = 0): Promise<SignerWithAddress> => {
    if (testaccount){
        await hre.ethers.provider.send('hardhat_impersonateAccount', [testaccount] );
        const signer: any = await hre.ethers.provider.getSigner(testaccount)
        if(!(signer as any).address)
            signer.address = signer._address
        return signer
    }
    else
        return (await hre.ethers.getSigners())[signerIndex]
}

task("transfercrabadas", "Transfer the specified creabadas.", async ({ to, crabadas }, hre): Promise<void> => {

    const signer = await getSigner(hre);

    const crabadasIds = (crabadas as string).split(',').map( x => Number(x) )

    const { crabada } = getCrabadaContracts(hre)

    const override = hre.crabada.network.getOverride()

    for (const c of crabadasIds){
        try {
            console.log("safeTransferFrom(signer.address, to, c)", signer.address, to, c);
            await crabada.connect(signer).callStatic["safeTransferFrom(address,address,uint256)"](signer.address, to, c)
            await logTransactionAndWait(
                crabada.connect(signer)["safeTransferFrom(address,address,uint256)"](signer.address, to, c, override), 
                1
            )
        } catch (error) {
            console.error(error);
        }
    }
    
})
    .addParam("to", "Destination address.", undefined, types.string)
    .addParam("crabadas", "Crabadas to transfer.", undefined, types.string)


task("depositcrabadas", "Deposit crabadas to idle game.", async ({ crabadas }, hre): Promise<void> => {

    const signer = await getSigner(hre);

    const crabadasIds = (crabadas as string).split(',').map( x => BigNumber.from(x) )

    const override = hre.crabada.network.getOverride()

    await deposit(hre, signer, crabadasIds, override)

})
    .addParam("crabadas", "Crabadas to deposit.", undefined, types.string)

task("removecrabadasfromteam", "Removes crabadas from team.", async ({ teamid, position }, hre): Promise<void> => {

    const signer = await getSigner(hre);

    const { idleGame } = getCrabadaContracts(hre)

    const override = hre.crabada.network.getOverride()

    const positions = position ? [position] : [0,1,2]

    for (const pos of positions){
        console.log("iddleGame.removeCrabadaFromTeam(teamId, position);", teamid, pos);
        await idleGame.connect(signer).callStatic.removeCrabadaFromTeam(teamid, pos, override)
        await logTransactionAndWait(
            idleGame.connect(signer).removeCrabadaFromTeam(teamid, pos, override), 
            1
        )

    }

})
    .addParam("teamid", "The Team ID. If not supplied, then the team will be created.", undefined, types.int)
    .addOptionalParam("position", "Position to remove. From 0 to 2.", undefined, types.int)


task("addcrabadastoteam", "Add crabadas to team for the specified signer.", async ({ teamid, crabadas }, hre): Promise<void> => {

    const signer = await getSigner(hre);

    const crabadasIds = (crabadas as string).split(',').map( x => Number(x) )

    const { idleGame } = getCrabadaContracts(hre)

    const override = hre.crabada.network.getOverride()

    if (teamid) {

        let position = 0

        for (const c of crabadasIds){
            console.log("iddleGame.addCrabadaToTeam(teamId, position, crabadaId);", teamid, position, c);
            await idleGame.connect(signer).callStatic.addCrabadaToTeam(teamid, position, c, override)
            await logTransactionAndWait(
                idleGame.connect(signer).addCrabadaToTeam(teamid, position, c, override), 
                1
            )
            position++
        }

    } else {

        console.log("iddleGame.createTeam(crabadaId1, crabadaId2, crabadaId3, override)", ...crabadasIds);
        await idleGame.connect(signer).callStatic.createTeam(...crabadasIds, override)
        await logTransactionAndWait(
            idleGame.connect(signer).createTeam(...crabadasIds, override),
            1
        )

    }

})
    .addOptionalParam("teamid", "The Team ID. If not supplied, then the team will be created.", undefined, types.string)
    .addParam("crabadas", "Crabadas to transfer.", undefined, types.string)

export const delay = async (ms: number, log = console.log): Promise<void> => {
    log('WAIT', ms, 'miliseconds')
    return new Promise((resolve) => {
        setTimeout(()=> resolve(undefined), ms)
    })
}

export const isLootingPeriod = ():boolean => {
    const d = new Date()
    const hours = d.getUTCHours()
    return (hours >= (7+3) && hours < (19+3))
}

// npx hardhat minestep --network localhost --minerteamid 3286 --attackercontract 0x74185cE8C16392C19CDe0F132c4bA6aC91dFcA02 --attackerteamid 3785 --wait 1 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
task(
    "minestep",
    "Mine step: If mining, try to close game. Then, if not mining, create a game.",
    async ({ minerteamid, attackercontract, attackerteamid, wait, testmineraccount, testattackeraccounts, accountindex }, hre: HardhatRuntimeEnvironment) => {
        
        if (isLootingPeriod()){
            console.log('Looting period.');
            return
        }

        // while (true){

            for (const mineGroup of hre.crabada.network.MINE_GROUPS){

                console.log('mineGroup.teamsOrder', ...mineGroup.teamsOrder);
                console.log('mineGroup.crabadaReinforcers', ...mineGroup.crabadaReinforcers);
    
                try {
    
                    let previousTeam = undefined
    
                    if (mineGroup.teamsOrder.length == 8){
                        
                        const areAllGroupTeamsUnlocked = await areAllTeamsUnlocked(hre, mineGroup.teamsOrder)
    
                        if (!areAllGroupTeamsUnlocked)
                            previousTeam = mineGroup.teamsOrder[7]
                    }
    
                    for (const teamId of mineGroup.teamsOrder){
                        const { signerIndex } = hre.crabada.network.MINE_CONFIG_BY_TEAM_ID[teamId]
                        const minerSigner = await getSigner(hre, undefined, signerIndex);
                        previousTeam = undefined // TODO Remove in case do only mining.
                        await mineStep(hre, teamId, undefined, undefined, wait, minerSigner, previousTeam, [])
                        previousTeam = teamId
                    }
    
                } catch (error) {
    
                    console.error(String(error));
    
                }
    
            }

        //     await delay(1000)
        // }

    })
    .addOptionalParam("minerteamid", "The teams IDs to use for mining. Separated by ','", undefined, types.string)
    .addOptionalParam("attackercontract", "The attacker contract address.", undefined, types.string)
    .addOptionalParam("attackerteamid", "The team ID to use for attack.", undefined, types.int)
    .addOptionalParam("wait", "Number of confirmation before continue execution.", 10, types.int)
    .addOptionalParam("testmineraccount", "Mining account used for testing", undefined, types.string)
    .addOptionalParam("testattackeraccounts", "Attacker accounts used for testing", undefined, types.string)
    .addOptionalParam("accountindex", "The index of the account to be used to sign the transactions", 0, types.int)

task(
    "mineloop",
    "Mine loop: Executes indefinetly the mine step, but stops in case of transaction rejection.",
    async ({ teamid, interval, gasprice, wait, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        let signer = undefined

        if (testaccount){
            await hre.ethers.provider.send('hardhat_impersonateAccount', [testaccount] );
            signer = await hre.ethers.provider.getSigner(testaccount)
        }

        return new Promise((resolve) => {

            const msInterval = interval*1000

            setTimeout(async function mineStepAndSchedule(){

                try {
                    try {
                        // await mineStep(hre, teamid, gasprice, wait, signer)
                    } catch (error) {
                        console.error(`ERROR: mineStep: ${error.toString()}`);
                    }
                    setTimeout(mineStepAndSchedule, msInterval)
                } catch (error) {
                    console.error(`ERROR: ${error.toString()}`)
                    resolve(undefined)
                }
        
            }, msInterval)
    
        })


    })
    .addParam("teamid", "The team ID to use for mining.")
    .addOptionalParam("interval", "Interval between mining steps in seconds.", 5, types.int)
    .addOptionalParam("gasprice", "Gas price in gwei.", 25, types.int)
    .addOptionalParam("wait", "Number of confirmation before continue execution.", 10, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "teamanalisys",
    "Analyse the best combinations of teams using Crabadas that are pure.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {
        
        const PRIME_INDEX = 2

        const descriptions = [
            'Surge',
            'Bulk',
            'Prime',
            'Gem',
            'Sunken',
            'Craboid',
            'Ruined',
            'Organic',            
        ]

        const price_breed3_in_tus = [
            10000000,
            48000,
            36000,
            40000,
            89000,
            32000,
            42000,
            10000000,
        ]

        const battlePoints = [
            239,
            238,
            221,
            236,
            224,
            221,
            224,
            227,
        ]

        const miningPoints = [
            65,
            66,
            82,
            67,
            80,
            82,
            80,
            77,
        ]

        const teams_by_id = {}

        for (let i=0; i<descriptions.length; i++){
            for (let j=0; j<descriptions.length; j++){
                const team = [0,0,1,0,0,0,0,0]
                team[i] = team[i]+1
                team[j] = team[j]+1
                const teamID = team.map(x=>x.toString()).join('')

                const mp = miningPoints[i]+miningPoints[j]+miningPoints[PRIME_INDEX]

                if (mp<231)
                    continue

                teams_by_id[teamID] = {
                    battlePoints: battlePoints[i]+battlePoints[j]+battlePoints[PRIME_INDEX],
                    miningPoints: mp,
                }
            }
        }

        const teams = []
        for (const id in teams_by_id){
            const participants = []
            let teamPrice = 0
            for (let class_index = 0; class_index<id.length; class_index++){
                for (let q=0; q<Number(id[class_index]); q++){
                    participants.push(descriptions[class_index])
                    teamPrice+=price_breed3_in_tus[class_index]
                }
            }
            teams.push({
                participants,
                ...teams_by_id[id],
                teamPrice,
            })
        }

        function compare( a, b ) {
            if ( a.battlePoints < b.battlePoints ){
                return 1;
            }
            if ( a.battlePoints > b.battlePoints ){
                return -1;
            }
            return 0;
        }
          
        teams.sort( compare );

        console.log(`Member1;Member2;Member3;BattlePoints;MiningPoints;TeamPrice`);
        teams.forEach(team => {
            console.log(`${team.participants[0]};${team.participants[1]};${team.participants[2]};${team.battlePoints};${team.miningPoints};${team.teamPrice}`);
        })

    })


task(
    "teaminfo",
    "Team information.",
    async ({ teamid }, hre: HardhatRuntimeEnvironment) => {

        const { idleGame } = getCrabadaContracts(hre)
        const teamInfo = await idleGame.getTeamInfo(teamid)
        const { owner, currentGameId: gameId3, crabadaId1: c1, crabadaId2: c2, crabadaId3: c3, battlePoint } = teamInfo
        console.log('owner', owner);
        console.log('members', [c1, c2, c3].map( (x:BigNumber) => x.toNumber() ));
        console.log('real bp', battlePoint);
        const factionBattlePoint = await TeamBattlePoints.createFromCrabadaIdsUsingContractForClassNames(hre, battlePoint, c1, c2, c3)
        if (factionBattlePoint){
            console.log('faction', factionBattlePoint.teamFaction);
            console.log('relative bp to', LOOTERS_FACTION, factionBattlePoint.getRelativeBP(LOOTERS_FACTION));
        }

    })
    .addParam("teamid", "Team ID.", undefined, types.int)


task(
    "settlegame",
    "Settle current game for team id.",
    async ({ player, teamid, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const { idleGame } = getCrabadaContracts(hre)

        const { currentGameId } = await idleGame.getTeamInfo(teamid)

        await settleGame(idleGame.connect(signer), currentGameId, 3)

    })
    .addParam("teamid", "Team ID which have a game to settle.", undefined, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "closegame",
    "Close current game for team id.",
    async ({ teamid }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre)

        const { idleGame } = getCrabadaContracts(hre)

        const { currentGameId } = await idleGame.getTeamInfo(teamid)

        const override = hre.crabada.network.getOverride()

        console.log(`closeGame(gameId: ${currentGameId})`);
        await idleGame.connect(signer).callStatic.closeGame(currentGameId, override)
        await logTransactionAndWait(idleGame.connect(signer).closeGame(currentGameId, override), 1)

    })
    .addParam("teamid", "Team ID which have a game to settle.", undefined, types.int)

task(
    "attack",
    "Attack.",
    async ({ gameid, teamid, expire, signature }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre)

        const { idleGame } = getCrabadaContracts(hre)

        // TODO Verify if needs other type of override
        const override = hre.crabada.network.getPriorityOverride()

        if (expire && signature){
            await idleGame.connect(signer).callStatic.attack(gameid, teamid, expire, signature, override)
            await logTransactionAndWait(
                idleGame.connect(signer).attack(gameid, teamid, expire, signature, override)
            , 1)
        } else {
            await idleGame.connect(signer).callStatic["attack(uint256,uint256)"](gameid, teamid, override)
            await logTransactionAndWait(
                idleGame.connect(signer)["attack(uint256,uint256)"](gameid, teamid, override)
            , 1)
        }

    })
    .addParam("gameid", "Team ID which have a game to settle.", undefined, types.int)
    .addParam("teamid", "Team ID which have a game to settle.", undefined, types.int)
    .addOptionalParam("expire", "Team ID which have a game to settle.", undefined, types.int)
    .addOptionalParam("signature", "Team ID which have a game to settle.", undefined, types.string)

task(
    "ownerof",
    "Remove of crabadas from team.",
    async ({ crabadaid }, hre: HardhatRuntimeEnvironment) => {
        
        const { crabada } = getCrabadaContracts(hre)
        console.log(await crabada.ownerOf(crabadaid));
        
    })
    .addParam("crabadaid", "Crabada ID.", undefined, types.int)


task(
    "listengames",
    "Listen StartGame events from current block.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {
        
        await (new Promise(() => {

            interface ClosedGameInfo {
                blockNumber: number, 
                transactionHash: string, 
                delayInClosedEventReception: number,
                gameId: number,
            }

            const { idleGame } = getCrabadaContracts(hre)
            const closedGamesInfo = {}

            idleGame.on( idleGame.filters.CloseGame(), async (gameId: BigNumber, { transactionHash, blockNumber, getBlock }) => {
                const eventReceivedTimestamp = (+new Date())/1000
                const { timestamp: blockTimestamp } = await getBlock()
                const { teamId } = await idleGame.getGameBasicInfo(gameId)
                closedGamesInfo[teamId.toString()] = ({ 
                    blockNumber, 
                    transactionHash, 
                    delayInClosedEventReception: eventReceivedTimestamp - blockTimestamp,
                    gameId: gameId.toNumber()
                } as ClosedGameInfo)
                // console.log('blockNumber', blockNumber, 'transactionHash', transactionHash)
            })        

            idleGame.on( idleGame.filters.StartGame(), async (gameId: BigNumber, teamId: BigNumber, duration: BigNumber, craReward: BigNumber, tusReward: BigNumber, { transactionHash, blockNumber, getBlock }) => {
                const eventReceivedTimestamp = (+new Date())/1000
                const { timestamp: blockTimestamp } = await getBlock()
                const closedGameInfo: ClosedGameInfo|undefined = closedGamesInfo[teamId.toString()] ?
                    closedGamesInfo[teamId.toString()] : undefined
                // console.log('blockNumber', blockNumber, 'transactionHash', transactionHash)
                if (closedGameInfo){
                    console.log('CloseGame(gameId)', closedGameInfo.gameId);
                    console.log('Blocks between closeGame and startGame', blockNumber - closedGameInfo.blockNumber)
                    console.log('Delay in CloseGame event reception', closedGameInfo.delayInClosedEventReception)
                }
                console.log('StartGame(gameId, teamId, duration, craReward, tusReward):', [gameId.toNumber(), teamId.toNumber(), duration.toNumber(), formatEther(craReward), formatEther(tusReward)]);
                console.log('');
            })        
    
        }))

    })


const MIN_BATTLE_POINTS = 564
const MAX_BATTLE_POINTS = 712
const STEP_BATTLE_POINTS = (MAX_BATTLE_POINTS-MIN_BATTLE_POINTS)/10

export const getClassNameByCrabada = async (hre: HardhatRuntimeEnvironment): Promise<ClassNameByCrabada> => {

    const { crabada } = getCrabadaContracts(hre)

    const result: ClassNameByCrabada = {}

    crabada.on(crabada.filters.Hatch(), async (tokenId: BigNumber, dna: BigNumber)=>{

        try {
            result[tokenId.toString()] = classNameFromDna(dna)
        } catch (error) {
            console.error('ERROR: trying to obtain classname for crabada', tokenId.toString(), String(error));
        }

    })

    try {

        throw new Error('Disabled class retrieval from hatch events.')
        
        console.log('Getting Hatch events to obtain class names of crabadas from dna.');
        
        const hatchEvents: ethers.Event[] = await crabada.queryFilter(crabada.filters.Hatch(), 0)

        console.log('Hatch events obtained', hatchEvents.length);

        for (const e of hatchEvents){

            const { tokenId, dna } = e.args

            try {
                result[(tokenId as BigNumber).toString()] = classNameFromDna(dna)
            } catch (error) {
                console.error('ERROR trying to obtain classname for crabada', tokenId.toString(), String(error));
            }

        }
        
    } catch (error) {

        console.error('ERROR Trying to obtain class names from Hatch events', String(error));

        console.log('Getting class names using API.');

        const apiResult: ClassNameByCrabada = await hre.crabada.api.getClassNameByCrabada()

        console.log('Obtained class name for', Object.keys(apiResult).length, 'crabadas');

        for ( const crabadaId in apiResult ){
            result[crabadaId] = apiResult[crabadaId]
        }

    }

    if (Object.keys(result).length == 0)
        throw new Error("ERROR: Not possible to obtain crabada's class names.");

    return result

}

export const areAllTeamsLocked = async (hre: HardhatRuntimeEnvironment, idleGame: Contract, teams: number[]) => {
    return (await Promise.all(
        teams.map( async(looterteamid): Promise<boolean> => await isTeamLocked(hre, idleGame, looterteamid)) 
        )).every( locked => locked )
}

export const areAllTeamsUnlocked = async (hre: HardhatRuntimeEnvironment, teams: number[], log = ()=>{}) => {
    const { idleGame } = getCrabadaContracts(hre)
    return (await Promise.all(
        teams.map( async(looterteamid): Promise<boolean> => await isTeamLocked(hre, idleGame, looterteamid, log)) 
        )).every( locked => !locked )
}


task(
    "loot",
    "Loot process.",
    async ({ blockstoanalyze, firstdefendwindow, testaccount, testmode }, hre: HardhatRuntimeEnvironment) => {

        if (!(hre.config.nodeId in CONFIG_BY_NODE_ID))
            return

        const nodeConfig: NodeConfig = CONFIG_BY_NODE_ID[hre.config.nodeId]

        const { idleGame } = getCrabadaContracts(hre)

        const lootersTeams = nodeConfig.accountsConfigs.map(c=>c.teams).flat()

        if (lootersTeams.length == 0)
            return

        if ( !testmode && (await areAllTeamsLocked(hre, idleGame, lootersTeams)) )
            return

        const classNameByCrabada: ClassNameByCrabada = await getClassNameByCrabada(hre)

        const teamsThatPlayToLooseByTeamId = await (
            nodeConfig.lootConfig.attackOnlyTeamsThatPlayToLoose ? 
                getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow, classNameByCrabada)
                : getTeamsBattlePoint(hre, blockstoanalyze, classNameByCrabada)
        )

        await updateTeamsThatWereChaged(hre, teamsThatPlayToLooseByTeamId, classNameByCrabada, blockstoanalyze)

        const updateTeamBattlePointListener = async (teamId: BigNumber)=>{
            if (!teamsThatPlayToLooseByTeamId[teamId.toString()])
                return
            const battlePoint: TeamBattlePoints = await TeamBattlePoints.createFromTeamId(idleGame, teamId, classNameByCrabada)
            console.log('Team', teamId.toString(), 'updated battlePoint, from', 
                teamsThatPlayToLooseByTeamId[teamId.toString()].battlePoint, 'to', battlePoint);
            teamsThatPlayToLooseByTeamId[teamId.toString()].battlePoint = battlePoint
        }

        idleGame.on(idleGame.filters.AddCrabada(), updateTeamBattlePointListener)

        while (testmode || !(await areAllTeamsLocked(hre, idleGame, lootersTeams))){

            for (const accountConfig of nodeConfig.accountsConfigs){

                const signer = await getSigner(hre, testaccount, accountConfig.accountIndex)
    
                console.log('Looting with signer', signer.address);
    
                for (const looterTeamId of accountConfig.teams){
    
                    console.log('Looting with team id', looterTeamId);
    
                    await loot(hre, teamsThatPlayToLooseByTeamId, looterTeamId, signer, classNameByCrabada, console.log, testmode);    
                }
    
            }
    
        }

        idleGame.off(idleGame.filters.AddCrabada(), updateTeamBattlePointListener)

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 43200 /*24 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)
    .addOptionalParam("testmode", "Test mode", true, types.boolean)

const REINFORCE_CONFIG: AccountConfig[] = [
    player1,
    player2,
    player3,
    player4,
    player5,
    player6
]

task(
    "reinforce",
    "Reinforce process.",
    async ({ testmode }, hre: HardhatRuntimeEnvironment) => {

        for (const {teams, signerIndex} of hre.crabada.network.LOOT_CAPTCHA_CONFIG.players){

            const signer = await getSigner(hre, undefined, signerIndex)

            console.log('Reinforce for signer', signer.address);

            for (const looterTeamId of teams){
    
                console.log('Reinforce for team id', looterTeamId);

                try {

                    const tr = await reinforce(hre, looterTeamId, signer, undefined, console.log, testmode);

                } catch (error) {
                    
                    console.error('ERROR', String(error));
                    
                }

            }

        }

    })
    .addOptionalParam("testmode", "Test mode", true, types.boolean)


task(
    "reinforcedefense",
    "Reinforce defense process.",
    async ({ testaccount, testmode }, hre: HardhatRuntimeEnvironment) => {

        for (const {signerIndex, teams} of hre.crabada.network.MINE_CONFIG){

            const signer = await getSigner(hre, testaccount, signerIndex)

            console.log('Reinforce for signer', signer.address);

            for (const minerTeamId of teams){
    
                console.log('Reinforce for team id', minerTeamId);

                try {

                    const tr = await reinforce(hre, minerTeamId, signer, undefined, console.log, testmode);

                } catch (error) {
                    
                    console.error('ERROR', String(error));
                    
                }

            }

        }

    })
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)
    .addOptionalParam("testmode", "Test mode", true, types.boolean)


interface LootPendingConfig {
    players: {
        address: string,
        teams: number[]
    }[],
    router: {
        address: string,
    },
    behaviour: {
        deviationToUse: (startStandardDeviationInBlocks: number) => number,
    }
    maxBlocksPerTeams: number,
    maxStandardDeviation: number,
    attackTransaction: {
        override: {
            gasLimit: number,
            // gasPrice: BigNumber,
            maxFeePerGas: BigNumber,
            maxPriorityFeePerGas: BigNumber,
        }
    }
}

const LOOT_PENDING_maxPriorityFeePerGas = BigNumber.from(ONE_GWEI*35)

export const LOOT_PENDING_CONFIG: LootPendingConfig = {
    maxBlocksPerTeams: 55,
    maxStandardDeviation: 14,
    router: {
        address: '0x524Ba539123784d404aD3756815B3d46eF2A6430'
    },
    behaviour: {
        deviationToUse: (startStandardDeviationInBlocks: number): number => 
            Math.max(5, startStandardDeviationInBlocks)
    },
    attackTransaction: {
        override: {
            gasLimit: 1000000,
            maxFeePerGas: BigNumber.from(ONE_GWEI*400),
            maxPriorityFeePerGas: LOOT_PENDING_maxPriorityFeePerGas
        }
    },        
    players: [
        {
            address: player1.player,
            teams: player1.teams
        },
        {
            address: player2.player,
            teams: player2.teams
        },
        {
            address: player3.player,
            teams: player3.teams
        },
        {
            address: player4.player,
            teams: player4.teams
        },
        {
            address: player5.player,
            teams: player5.teams
        },
        {
            address: player6.player,
            teams: player6.teams
        },
    ]
}

const LOOT_PENDING_maxGasPriceWithPriority = BigNumber.from(ONE_GWEI*120)

const LOOT_PENDING_minPriorityFeePerGas = BigNumber.from(ONE_GWEI*5.1)

const updateGasPriceFunction = (hre: HardhatRuntimeEnvironment): (() => Promise<void>) =>{
    return async () => {
        const gasBaseFee = await baseFee(hre)
        const gasPrice = gasBaseFee.add(LOOT_PENDING_maxPriorityFeePerGas)

        if (gasPrice.lte(LOOT_PENDING_maxGasPriceWithPriority)){
            LOOT_PENDING_CONFIG.attackTransaction.override.maxPriorityFeePerGas = LOOT_PENDING_maxPriorityFeePerGas
        }
        else{
            const maxPriorityFeePerGas = LOOT_PENDING_maxGasPriceWithPriority.sub(gasBaseFee)
            LOOT_PENDING_CONFIG.attackTransaction.override.maxPriorityFeePerGas = 
                maxPriorityFeePerGas.lt(LOOT_PENDING_minPriorityFeePerGas) ?
                    LOOT_PENDING_minPriorityFeePerGas : maxPriorityFeePerGas
        }

        console.log('maxPriorityFeePerGas updated to', 
            formatUnits(LOOT_PENDING_CONFIG.attackTransaction.override.maxPriorityFeePerGas, 9),
            'gwei',
            '| base',
            formatUnits(gasBaseFee, 9),
        );
    }
}

task(
    "testupdategasprice",
    "Test the update of gas price.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {

        const updateGasPrice = updateGasPriceFunction(hre)
        await updateGasPrice()

        setInterval(updateGasPrice, 10_000)

        await new Promise(()=>{

        })

    })

task(
    "lootpending",
    "Loot pending startGame transactions.",
    async ({ blockstoanalyze, firstdefendwindow, testaccount, testmode, debug }, hre: HardhatRuntimeEnvironment) => {

        // const updateGasPrice = updateGasPriceFunction(hre)
        // const gasPriceUpdateInterval = setInterval(updateGasPrice, 10_000)
        // await updateGasPrice()

        // signer used to settle
        const settleSigner = await getSigner(hre, testaccount)

        const lootersSigners = (await hre.ethers.getSigners()).slice(1)

        const { idleGame } = getCrabadaContracts(hre)
        const router: Contract | undefined = 
            LOOT_PENDING_CONFIG.router.address ? 
                await attachAttackRouter(hre, LOOT_PENDING_CONFIG.router.address)
                : undefined

        // Verify there are teams in the config.

        const lootersTeams = LOOT_PENDING_CONFIG.players.map( p => p.teams ).flat()

        if (lootersTeams.length == 0)
            return

        // Initialize Player/Team data structure

        interface PlayerTeamPair {
            playerAddress: string,
            teamId: number,
            locked: boolean,
            battlePoint: TeamBattlePoints,
            settled: boolean,
        }

        const playerTeamPairs: PlayerTeamPair[] = await Promise.all(LOOT_PENDING_CONFIG.players
            .map( p => p.teams
                .map( async(teamId) => {
                    const { currentGameId }: { currentGameId: BigNumber } = 
                        await idleGame.getTeamInfo(teamId)
                    return ({
                        playerAddress: p.address,
                        teamId,
                        locked: true,
                        battlePoint: await TeamBattlePoints.createFromTeamIdUsingContractForClassNames(hre, teamId),
                        settled: currentGameId.isZero(),
                    })
                })
            )
            .flat())
        
        
        // Initialize teams' lock status

        const updateLockStatus = async (hre: HardhatRuntimeEnvironment, idleGame: Contract, playerTeamPairs: PlayerTeamPair[], log: (typeof console.log)) => {
            return (await Promise.all(
                playerTeamPairs.map( async(playerTeamPair): Promise<any> => {
                    playerTeamPair.locked = !testmode && await isTeamLocked(hre, idleGame, playerTeamPair.teamId, log)
                    const { currentGameId }: { currentGameId: BigNumber } = 
                        await idleGame.getTeamInfo(playerTeamPair.teamId)
                    playerTeamPair.settled = testmode || currentGameId.isZero()

                }) 
            ))
        }

        await updateLockStatus(hre, idleGame, playerTeamPairs, console.log)

        // Sets interval to settleGame for unlocked teams.
        
        let settleInProgress = false

        const settleGames = async(log: (typeof console.log) = ()=>{})=>{

            if (settleInProgress)
                return

            settleInProgress = true

            try {

                for (const p of playerTeamPairs.filter(p=> (!p.locked && !p.settled))){
                    const { currentGameId } = await idleGame.getTeamInfo(BigNumber.from(p.teamId))
                    await settleGame(idleGame.connect(settleSigner), currentGameId, 1, log)
                }
                    
            } catch (error) {

                // To be possible to deactivate settleInProgress
                
            }

            settleInProgress = false

        }

        !testmode && (await settleGames(console.log))

        const now = new Date()

        if (now.getUTCDate()>=7 && now.getUTCHours()>=7){
            console.log('Anti-Bot patch is LIVE!');
            return
        }

        const settleGameInterval = !testmode && setInterval(() => settleGames(()=>{}), 2000)


        // Verify if all teams are locked.

        const areAllPlayerTeamPairsLocked = (playerTeamPairs: PlayerTeamPair[]): boolean => {
            return playerTeamPairs.map( ({ locked }) => locked ).every( locked => locked )
        }

        if ( !testmode && (areAllPlayerTeamPairsLocked(playerTeamPairs)) )
            return

        
        const classNameByCrabada: ClassNameByCrabada = await getClassNameByCrabada(hre)
        
        // Teams that play to loose...

        const teamsThatPlayToLooseByTeamId: TeamInfoByTeam = 
            await getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow, classNameByCrabada)

        console.log('teamsThatPlayToLooseByTeamId', Object.keys(teamsThatPlayToLooseByTeamId).length);

        // Update teams thar were changed and set interval to update regularly...

        await updateTeamsThatWereChaged(hre, teamsThatPlayToLooseByTeamId, classNameByCrabada, blockstoanalyze)

        const updateTeamBattlePointListener = async (teamId: BigNumber)=>{
            if (!teamsThatPlayToLooseByTeamId[teamId.toString()])
                return
            const battlePoint: TeamBattlePoints = await TeamBattlePoints.createFromTeamId(idleGame, teamId, classNameByCrabada)
            console.log('Team', teamId.toString(), 'updated battlePoint, from', 
                teamsThatPlayToLooseByTeamId[teamId.toString()].battlePoint, 'to', battlePoint);
            teamsThatPlayToLooseByTeamId[teamId.toString()].battlePoint = battlePoint
        }

        idleGame.on(idleGame.filters.AddCrabada(), updateTeamBattlePointListener)

        // Set interval for updating teams' lock status.

        const updateLockStatusInterval = setInterval(() => updateLockStatus(hre, idleGame, playerTeamPairs, ()=>{}), 1000);

        // Listen for CloseGame events to register team for looting

        interface StartGameTargets {
            teamId: BigNumber,
            attacksPerformed: number,
        }

        interface StartedGameTargetsByTeamId {
            [teamId:string]: StartGameTargets
        }

        let attackIteration = 0

        interface TeamAndItsTransaction {
            teamId: BigNumber,
            txHash: string
        }

        const attackTeamsThatStartedAGame = (teamsAndTheirTransactions: TeamAndItsTransaction[]) => {


            if (teamsAndTheirTransactions.length == 0){
                return
            }

            const startedGameTargetsByTeamId: StartedGameTargetsByTeamId = {}

            teamsAndTheirTransactions.forEach( ({ teamId, txHash }) => {

                const targetTeamInfo = teamsThatPlayToLooseByTeamId[teamId.toString()]
    
                if (!targetTeamInfo){
                    debug && console.log('Discarded, team does not play to loose.', teamId.toString());
                    return
                }
    
                if (!targetTeamInfo.battlePoint){
                    debug && console.log('Discarded, team with no battlePoint defined.', teamId.toString());
                    return
                }
    
                if (!targetTeamInfo.battlePoint.isValid()){
                    debug && console.log('Discarded, team with no valid battlePoint.', teamId.toString());
                    return
                }
    
                const pairsStrongerThanTarget = playerTeamPairs.filter( p => p.battlePoint.gt(targetTeamInfo.battlePoint))
    
                if (pairsStrongerThanTarget.length == 0){
                    debug && console.log('Discarded, no stronger team for attack. (teamId, playerTeamPairs.battlePoint, target.battlePoint)', 
                        teamId.toString(), playerTeamPairs.map(p=>p.battlePoint), targetTeamInfo.battlePoint);
                    return
                }
    
                startedGameTargetsByTeamId[teamId.toString()] = {
                    teamId,
                    attacksPerformed: 0,
                }
    
                console.log('Pending startGame', txHash, 
                    'Added team to loot targets', teamId.toNumber()
                );
    
            })

            interface TargetsFactionAdvantageClassification { 
                targetsWithAdvantageByTeamId: StartedGameTargetsByTeamId, 
                targetsWithNoAdvantageByTeamId: StartedGameTargetsByTeamId
            }
            const classifyTargetsUsingFactionAdvantage = 
                (startedGameTargetsByTeamId: StartedGameTargetsByTeamId, lootersFaction: TeamFaction): TargetsFactionAdvantageClassification => {

                    const targetsWithAdvantageByTeamId: StartedGameTargetsByTeamId = {}
                    const targetsWithNoAdvantageByTeamId: StartedGameTargetsByTeamId = {}
                    
                    for (const teamId in startedGameTargetsByTeamId){
                        const startedGameTargetByTeamId = startedGameTargetsByTeamId[teamId]
                        
                        const targetInfo = teamsThatPlayToLooseByTeamId[teamId]

                        // This is necessary because teamsThatPlayToLooseByTeamId could be updated.
                        if (!targetInfo){
                            debug && console.log('Attack Interval', 'Team', Number(teamId), 'does not play to loose.');
                            continue
                        }
    
                        // This is necessary because teamsThatPlayToLooseByTeamId could be updated.
                        if (!targetInfo.battlePoint){
                            debug && console.log('Attack Interval', 'Team', Number(teamId), 'does not has battlePoint defined.');
                            continue
                        }
    
                        // This is necessary because teamsThatPlayToLooseByTeamId could be updated.
                        if (targetInfo.battlePoint.hasAdvantageOverFaction(lootersFaction)){
                            targetsWithAdvantageByTeamId[teamId] = startedGameTargetByTeamId
                        } else {
                            targetsWithNoAdvantageByTeamId[teamId] = startedGameTargetByTeamId
                        }
    
                    }

                    return { 
                        targetsWithAdvantageByTeamId,
                        targetsWithNoAdvantageByTeamId
                    }

                }

            const { targetsWithAdvantageByTeamId, targetsWithNoAdvantageByTeamId } = classifyTargetsUsingFactionAdvantage(
                startedGameTargetsByTeamId, LOOTERS_FACTION
            )
            
            attackTeams(targetsWithAdvantageByTeamId, true, LOOTERS_FACTION)
            attackTeams(targetsWithNoAdvantageByTeamId, false, LOOTERS_FACTION)

        }

        const addTeamToLootTargets = (txs: ethers.Transaction[]) => {

            if (txs.length == 0){
                return
            }

            const teamsAndTheirTransactions: TeamAndItsTransaction[] = txs.map( tx => {

                const teamId = BigNumber.from(`0x${tx.data.slice(-64)}`)
                console.log('Pending start game transaction', tx.hash, (tx as any).blockNumber, teamId.toString());

                return { teamId, txHash: tx.hash }

            })

            attackTeamsThatStartedAGame(teamsAndTheirTransactions)

        }

        const pendingStartGameTransactionInterval = await listenPendingStartGameTransaction(hre, addTeamToLootTargets)

        // const startGameEventsInterval = await listenStartGameEvents(hre, logs => {

        //     const teamsAndTheirTransaction: TeamAndItsTransaction[] = logs.map( ({teamId, log: {transactionHash, blockNumber}}) => {

        //         console.log('start game event', transactionHash, blockNumber, teamId.toString());

        //         return {
        //             teamId,
        //             txHash: transactionHash
        //         }
        //     })
            
        //     attackTeamsThatStartedAGame(teamsAndTheirTransaction)
        // }, 50)


        // Main interval to perform attacks considering the following conditions:
        // 1) Apply only for looter teams are unlocked
        // 2) Targets should have battlePoint lower than the maximum looterTeam target battlePoint.
        // 3) For targets currentBlockNumber-closeGameBlockNumber >= minBlocknumberDistance-2
        // 4) Apply only for looter teams that have battlePoint higher than minimum target battlePoint.

        const attackTeams = async (startedGameTargetsByTeamId: StartedGameTargetsByTeamId, targetsHaveAdvantage: boolean, lootersFaction: TeamFaction) => {

            // 1) Apply only for looter teams are unlocked
            const unlockedPlayerTeamPairs = playerTeamPairs.filter( p => (!p.locked && p.settled) || testmode )

            if (unlockedPlayerTeamPairs.length == 0){
                console.log('Attack Interval', 'No unlocked and settled looter teams');
                return
            }

            assert(
                unlockedPlayerTeamPairs.every(p=>p.battlePoint.teamFaction == lootersFaction),
                `ERROR: Not satisfied precondition where all looter teams have the same faction: ${lootersFaction}`
            )

            // Get the max battlePoint for unlocked looter teams.

            const maxUnlockedLooterBattlePoint: TeamBattlePoints = unlockedPlayerTeamPairs
                .reduce((previous, current) => 
                    previous.gt(current.battlePoint) ? previous : current.battlePoint,
                unlockedPlayerTeamPairs[0].battlePoint)

            const teamIdTargets = Object.keys(startedGameTargetsByTeamId)
                // 2) Targets should have battlePoint lower than the maximum looterTeam target battlePoint.
                .filter(teamId => {

                    const targetInfo = teamsThatPlayToLooseByTeamId[teamId]

                    // This is necessary because teamsThatPlayToLooseByTeamId could be updated.
                    if (!targetInfo){
                        debug && console.log('Attack Interval', 'Team', Number(teamId), 'does not play to loose.');
                        return false
                    }

                    // This is necessary because teamsThatPlayToLooseByTeamId could be updated.
                    if (!targetInfo.battlePoint){
                        debug && console.log('Attack Interval', 'Team', Number(teamId), 'does not has battlePoint defined.');
                        return false
                    }
                    
                    if (targetInfo.battlePoint.gte(maxUnlockedLooterBattlePoint)){
                        debug && console.log('Attack Interval', 'Team', Number(teamId), 'has higher battlePoint', 
                        targetInfo.battlePoint, 'than', maxUnlockedLooterBattlePoint);
                        return false
                    }
                    
                    return true
                })


            if (teamIdTargets.length == 0){
                return
            }

            const targetsBattlePoints = teamIdTargets.map( teamId => teamsThatPlayToLooseByTeamId[teamId].battlePoint )
            const minTargetBattlePoint: TeamBattlePoints = 
                targetsBattlePoints
                .reduce((previous, current) => 
                    previous.getRelativeBP(lootersFaction) < current.getRelativeBP(lootersFaction) ? previous : current,
                    targetsBattlePoints[0]
                )

            // 4) Apply only for looter teams that have battlePoint higher than minimum target battlePoint.
            const unlockedPlayerTeamPairsWithEnoughBattlePoint =
                unlockedPlayerTeamPairs.filter( p => p.battlePoint.gt(minTargetBattlePoint) )

            if (unlockedPlayerTeamPairsWithEnoughBattlePoint.length == 0){
                console.log('Attack Interval', 'No unlocked and settled looter teams with enough battle points', 
                    unlockedPlayerTeamPairs.map( p => p.battlePoint), '<=', minTargetBattlePoint)
                return
            }

            const unlockedPlayerTeamPairsWithEnoughBattlePointSorted =
                unlockedPlayerTeamPairsWithEnoughBattlePoint.sort( (a,b) => 
                    a.battlePoint.lt(b.battlePoint) ? -1 : a.battlePoint.gt(b.battlePoint) ? 1 : 0
                )

            const looterSignerIndex = attackIteration % lootersSigners.length
            attackIteration++

            const playerAddresses = unlockedPlayerTeamPairsWithEnoughBattlePointSorted.map(p=>p.playerAddress)
            const looterTeams = unlockedPlayerTeamPairsWithEnoughBattlePointSorted.map(p=>p.teamId)
            const looterRelativeBattlePoint = unlockedPlayerTeamPairsWithEnoughBattlePointSorted.map(p=>p.battlePoint.getRelativeBPForAdvantage(targetsHaveAdvantage))
            const targetRelativeBattlePoint = teamIdTargets.map(teamId => teamsThatPlayToLooseByTeamId[teamId].battlePoint.getRelativeBP(lootersFaction))

            console.log('Looting with advantage:', !targetsHaveAdvantage)
            console.log(
                +new Date()/1000,
                'attackTeams(', 
                'players=', playerAddresses.toString(),
                'looterTeams=', looterTeams.toString(),
                'looterRelativeBattlePoint=', looterRelativeBattlePoint.toString(),
                'targetTeams=', teamIdTargets.toString(),
                'targetRelativeBattlePoint=', targetRelativeBattlePoint.toString(),
                ')'
            )

            // Are increased the attacks performed by target
            teamIdTargets.forEach( teamId => startedGameTargetsByTeamId[teamId].attacksPerformed++ )

            if (testmode)
                return

            if (!router)
                return

            try {

                // for test mode we perform a static call.
                const attackTeams = router.connect(lootersSigners[looterSignerIndex]).attackTeams

                const transactionResponse: ethers.providers.TransactionResponse = await attackTeams(
                    idleGame.address,
                    playerAddresses,
                    looterTeams,
                    looterRelativeBattlePoint,
                    teamIdTargets,
                    targetRelativeBattlePoint,
                    LOOT_PENDING_CONFIG.attackTransaction.override
                )

                if (transactionResponse && (transactionResponse.hash || transactionResponse.blockNumber))
                    console.log('router.attackTeams', 'transaction hash', transactionResponse.hash, 'blocknumber', transactionResponse.blockNumber);

            } catch (error) {

                console.error('ERROR', 'router.attackTeams', String(error));
                
            }

        }

        //const attackTeamsInterval = setInterval(attackTeams, 1000)

        // Never finish
        await new Promise((resolve) => {

            const endProcessInterval = setInterval(()=>{

                const unlockedPlayerTeamPairs = playerTeamPairs.filter( p => !p.locked || testmode )

                if (unlockedPlayerTeamPairs.length == 0){
                    console.log('Ending process', 'No unlocked looter teams');
                    clearInterval(endProcessInterval)
                    resolve(undefined)
                }

            }, 1000)
        })

        // clearInterval(gasPriceUpdateInterval)
        //clearInterval(attackTeamsInterval)
        clearInterval(pendingStartGameTransactionInterval)
        // clearInterval(startGameEventsInterval)
        idleGame.off(idleGame.filters.AddCrabada(), updateTeamBattlePointListener)
        clearInterval(updateLockStatusInterval)
        settleGameInterval && clearInterval(settleGameInterval)

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 43200 /*24 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)
    .addOptionalParam("testmode", "Test mode", true, types.boolean)
    .addOptionalParam("debug", "Debug mode", false, types.boolean)

    
export const START_GAME_ENCODED_OPERATION = '0xe5ed1d59'
export const START_GAME_EVENT_TOPIC ='0x0eef6f7452b7d2ee11184579c086fb47626e796a83df2b2e16254df60ab761eb'

interface EthFilterLog {
    transactionHash: string,
    blockNumber: number,
    data: string
}
interface StartGameEventLog {
    gameId: BigNumber,
    teamId: BigNumber,
    log: EthFilterLog
}

type StartGameEventTask = (logs: StartGameEventLog[]) => void

export const listenStartGameEvents = async (hre: HardhatRuntimeEnvironment, task: StartGameEventTask, interval: number = 50): Promise<NodeJS.Timer> => {

    const { idleGame } = getCrabadaContracts(hre)

    const filter = {
        fromBlock: 'latest',
        toBlock: 'latest',
        address: idleGame.address,
        topics: [ START_GAME_EVENT_TOPIC ]
    };
    
    const provider = hre.ethers.provider
    const filterId = await provider.send("eth_newFilter", [filter]);

    return setInterval(async () => {
        const logs = await provider.send("eth_getFilterChanges", [filterId]);

        const startGameLogs: StartGameEventLog[] = (logs as EthFilterLog[]).map( log => {
            
            const gameId = BigNumber.from(log.data.slice(0,66))
            const teamId = BigNumber.from('0x'+log.data.slice(66,130))

            return {
                gameId,
                teamId,
                log
            }
        })

        task(startGameLogs)

    }, interval)

}

task(
    "listenstartgameevents",
    "Listen StartGame events.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {
        
        await (new Promise(async () => {
            
            const listenInterval = listenStartGameEvents(hre, (logs) => {
                logs.forEach( ({ log, teamId, gameId }) => {
                    console.log(+new Date()/1000, "eth_getFilterChanges", log.transactionHash, log.blockNumber, teamId.toString(), gameId.toString());
                })
            }, 1000)

        }))

    })

task(
    "pendingstartgameevents",
    "Listen for pending transactions.",
    async ({ pending }, hre: HardhatRuntimeEnvironment) => {
        
        const provider = hre.ethers.provider

        const { idleGame } = getCrabadaContracts(hre)

        const mode = pending ? 'pending' : 'latest'

        const filter = {
            fromBlock: mode,
            toBlock: mode,
            address: idleGame.address,
            topics: [ START_GAME_EVENT_TOPIC ]
        };

        const filterId = await provider.send("eth_newFilter", [filter]);
        console.log(filterId);

        await (new Promise(() => {

            setInterval(async () => {
                const logs = await provider.send("eth_getFilterChanges", [filterId]);
                for (const log of logs){
                    const gameId = BigNumber.from((log.data as string).slice(0,66))
                    const teamId = BigNumber.from('0x'+(log.data as string).slice(66,130))
                    console.log(+new Date()/1000, "eth_getFilterChanges", log.transactionHash, BigNumber.from(log.blockNumber).toNumber(), teamId.toNumber());
                }
            }, 10)

        }))

    })
    .addOptionalParam('pending', 'Get pending events or lastest.', true, types.boolean)

export const getBlocksInterval = async (hre: HardhatRuntimeEnvironment, fromblock: number, toblock: number, blocksquan: number) => {
        
    const blockNumber = await hre.ethers.provider.getBlockNumber()

    const toBlock = toblock ? toblock 
        : fromblock ? fromblock+blocksquan
            : blockNumber

    const fromBlock = fromblock ? fromblock
        : toBlock-blocksquan

        
    return {fromBlock, toBlock: Math.min(toBlock, blockNumber)}

}

task(
    "tusrewards",
    "Get TUS rewards between 2 blocks.",
    async ({ fromblock, toblock, looter, blocksquan }, hre: HardhatRuntimeEnvironment) => {
        
        const provider = hre.ethers.provider
        const { fromBlock, toBlock } = await getBlocksInterval(hre, fromblock, toblock, blocksquan)

        const { tusToken } = getCrabadaContracts(hre)

        const tusWinningReward = parseEther('221.7375')
        const transferEvents = await queryFilterByPage(hre, tusToken, tusToken.filters.Transfer(undefined, looter), fromBlock, 
            Math.min(toBlock, await provider.getBlockNumber()))

        const VALUE_ARG_INDEX = 2
        const tusReward = transferEvents.reduce((previous: BigNumber, transferEvent) =>{
            const { value } = transferEvent.args
            if (tusWinningReward.eq(value)){
                return previous.add(value) 
            }
            return previous
        }, hre.ethers.constants.Zero)

        console.log(formatEther(tusReward))

    })
    .addOptionalParam("fromblock", "Blocks from.", undefined , types.int)
    .addOptionalParam("toblock", "To from.", undefined , types.int)
    .addOptionalParam("blocksquan", "Quantity ob blocks from fromblock.", 43200 /* 24 hours */ , types.int)
    .addParam("looter", "Looter's account address.", undefined , types.string)

task(
    "successdist",
    "Get the distribution of successful Attack transactions.",
    async ({ fromblock, toblock, blocksquan, teams, nodesquan }, hre: HardhatRuntimeEnvironment) => {

        const { fromBlock, toBlock } = await getBlocksInterval(hre, fromblock, toblock, blocksquan)

        const { idleGame } = getCrabadaContracts(hre)

        const fightEvents = await queryFilterByPage(hre, idleGame, idleGame.filters.Fight(), fromBlock, toBlock)

        interface Result {
            craReward: BigNumber,
            tusReward: BigNumber,
        }

        const looterTeams = (teams as string).split(',').map(x=>Number(x))

        const fightDistributionByNode = Array.from(Array(nodesquan).keys()).map(x=>0)

        await Promise.all(fightEvents.map(async (transferEvent: ethers.Event) =>{
           
            const { attackTeamId  } = transferEvent.args

            if (looterTeams.includes(attackTeamId.toNumber())){

                const transaction = await transferEvent.getTransaction()

                if (transaction.maxPriorityFeePerGas){
                    const nodeNumber = transaction.maxPriorityFeePerGas
                        .sub(transaction.maxPriorityFeePerGas.div(100).mul(100))
                        .toNumber()
                    fightDistributionByNode[nodeNumber-1]++
                }
    
            }

        }))

        fightDistributionByNode.forEach( (fights, index) => console.log('Node', index+1, 'fights', fights))

    })
    .addOptionalParam("fromblock", "Blocks from.", undefined , types.int)
    .addOptionalParam("toblock", "To from.", undefined , types.int)
    .addOptionalParam("blocksquan", "Quantity ob blocks from fromblock.", 43200 /* 24 hours */ , types.int)
    .addOptionalParam("teams", "Teams to be considered in the analysis.", "3286,3759,5032,5355,5357,6152,7449,8157,9236" , types.string)
    .addOptionalParam("nodesquan", "Nodes quantity", 11, types.int)

// TODO Task to understand costs
/**
 * Loose:
 *   a) Reverted transactions that attack teams already looted in other block.
 *   b) Gas price distance from winner attack and its distribution (requires to attack same team).
 */

 task(
    "attackgasdist",
    "Get the distribution of gas prices for attack transactions for targets between the battle point limits.",
    async ({ blockstoanalyze, firstdefendwindow, battlepointfrom, battlepointto, steps }, hre: HardhatRuntimeEnvironment) => {

        const { idleGame } = getCrabadaContracts(hre)

        const fightEventsPromise = queryFilterByPage(hre, idleGame, idleGame.filters.Fight(), 
            hre.ethers.provider.blockNumber-blockstoanalyze, hre.ethers.provider.blockNumber)

        const classNameByCrabada: ClassNameByCrabada = await getClassNameByCrabada(hre)

        const teamsThatPlayToLooseByTeamId = await getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow, classNameByCrabada)

        await updateTeamsThatWereChaged(hre, teamsThatPlayToLooseByTeamId, classNameByCrabada, blockstoanalyze)

        const fightEvents = await fightEventsPromise

        console.log('fightEvents', fightEvents.length);

        const gasPrices = (await Promise.all(
            fightEvents
                .filter((e: ethers.Event) =>{
                    const { turn, defensePoint } = e.args
                    return (turn == 0) && (defensePoint >= battlepointfrom) && (defensePoint <= battlepointto)
                })
                .map( async(e: ethers.Event) => {
                    const tr = await e.getTransactionReceipt()
                    return tr ? tr.effectiveGasPrice : undefined
                })
        )).filter(undefined)

        const gasPricesSortedAsc = gasPrices.sort(compareBigNumbers)

        const gasPricesSortedInGwei = gasPricesSortedAsc.map(x => x.div(ONE_GWEI).toNumber())


        const stepsDistributionForGasPrices: StepMaxValuesByPercentage = getPercentualStepDistribution(
            gasPricesSortedInGwei, steps)

        console.log('stepsDistributionForGasPrices', stepsDistributionForGasPrices);

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 43200 /*24 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("battlepointfrom", "Battle point from for the target teams to be included in the analisys.", 0, types.int)
    .addOptionalParam("battlepointto", "Battle point from for the target teams to be included in the analisys.", 711, types.int)
    .addOptionalParam("steps", "Step to consider in the gas price analysis.", 10 , types.int)

task(
    "successgasdiff",
    "Get the diference between successful Attack transactions for the specified looter teams, and other failed attack transactions with the same target.",
    async ({ fromblock, toblock, blocksquan, teams, steps }, hre: HardhatRuntimeEnvironment) => {

        const { fromBlock, toBlock } = await getBlocksInterval(hre, fromblock, toblock, blocksquan)

        const { idleGame } = getCrabadaContracts(hre)

        const fightEvents = await queryFilterByPage(hre, idleGame, idleGame.filters.Fight(), fromBlock, toBlock)

        console.log('fightEvents', fightEvents.length);

        const looterTeams = (teams as string).split(',').map(x=>Number(x))

        const fightEventsForLooterTeams = fightEvents
            .filter((e: ethers.Event) =>{
                const { attackTeamId, turn }: { attackTeamId: BigNumber, turn: BigNumber } = e.args as any
                return turn.isZero() && looterTeams.includes(attackTeamId.toNumber())
            })

        console.log('fightEventsForLooterTeams', fightEventsForLooterTeams.length);

        const gasPriceDistances: BigNumber[] = await Promise.all(fightEventsForLooterTeams
            .map(async (e: ethers.Event) =>{
           
                const { gameId } = e.args

                const transactionReceipt = await e.getTransactionReceipt()

                const blockTransactions = await hre.ethers.provider.getBlockWithTransactions(e.blockHash)

                const gameIdParameterForAttackTransaction = 
                    (t: ethers.Transaction) => BigNumber.from(`0x${t.data.slice(10,74)}`)

                const gasPriceDifferences: BigNumber[] = await Promise.all(
                    blockTransactions.transactions
                        .filter( t => {
                            
                            const ATTACK_ENCODED_OPERATION = '0xe1fa7638'
                            

                            return (
                                t.hash !== e.transactionHash
                                // Checks if it is an attack transaction for the same gameId
                                && t.data.slice(0,10) == ATTACK_ENCODED_OPERATION 
                                // Checks it is attacked the same gameId
                                && gameId.eq(gameIdParameterForAttackTransaction(t))
                            )
                        })
                        .map( async(t) => {
                            const failedTransactionReceipt = await hre.ethers.provider.getTransactionReceipt(t.hash)
                            return transactionReceipt.effectiveGasPrice.sub(failedTransactionReceipt.effectiveGasPrice)
                        })
                )

                if (gasPriceDifferences.length == 0)
                    return hre.ethers.constants.Zero.sub(1)
                
                // It is returned the lowest difference: the distance.
                return gasPriceDifferences.reduce( (prev, current) => {
                    return prev.lt(current) ? prev : current
                }, gasPriceDifferences[0])

            }
        ))

        const noCompetitionCount = gasPriceDistances.filter( x => x.isNegative() ).length

        console.log('Transactions without competition', noCompetitionCount);
        
        const withCompetition = gasPriceDistances.flat().filter( x => !x.isNegative() )

        console.log('Transactions with competition', withCompetition.length);


        if (withCompetition.length == 0)
            return

        const withCompetitionSortedDescending = withCompetition.sort(compareBigNumbersDescending)

        const withCompetitionSortedInGwey = withCompetitionSortedDescending.map(x => x.div(ONE_GWEI).toNumber())


        const stepsDistributionForHigherDistance: StepMaxValuesByPercentage = getPercentualStepDistribution(
            withCompetitionSortedInGwey, steps)

        console.log('stepsDistributionForHigherDistance', stepsDistributionForHigherDistance);

    })
    .addOptionalParam("fromblock", "Blocks from.", undefined , types.int)
    .addOptionalParam("toblock", "To from.", undefined , types.int)
    .addOptionalParam("blocksquan", "Quantity ob blocks from fromblock.", 43200 /* 24 hours */ , types.int)
    .addOptionalParam("teams", "Teams to be considered in the analysis.", LOOT_PENDING_CONFIG.players.flatMap((p)=>p.teams).join(',') , types.string)
    .addOptionalParam("steps", "Step to consider in the distance analysis.", 10 , types.int)

task(
    "pendingtransactions",
    "Test retrieve of pending transactions.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {
        
        await (new Promise(async () => {
            const { idleGame } = getCrabadaContracts(hre)

            const provider = hre.ethers.provider
            const filterId = await provider.send("eth_newPendingTransactionFilter", []);
            console.log(filterId);
    
            await (new Promise(() => {
    
                setInterval(async () => {
                    const pendingTransactions: string[] = await provider.send("eth_getFilterChanges", [filterId]);
                    console.log('pendingTransactions', pendingTransactions.length);
                    pendingTransactions.slice(0,3).forEach( async(t) => console.log(await provider.getTransaction(t)))
                }, 1000)
    
            }))
    
        }))

    })

type PendingTransactionsTask = (txs: ethers.Transaction[]) => void

const listenPendingStartGameTransaction = async (hre: HardhatRuntimeEnvironment, pendingTransactionsTask: PendingTransactionsTask, interval: number = 50): Promise<NodeJS.Timer> => {

    const { idleGame } = getCrabadaContracts(hre)

    const provider = hre.ethers.provider
    const filterId = await provider.send("eth_newPendingTransactionFilter", []);

    return setInterval(async () => {
                    
        const pendingTransactionsHashes: string[] = await provider.send("eth_getFilterChanges", [filterId]);
        // console.log('pendingTransactions', pendingTransactionsHashes.length);
        
        const transactions = await Promise.all(
            pendingTransactionsHashes
                .map( async(tHash) => await provider.getTransaction(tHash))
        )

        const startGameTransactions = transactions
            .filter( tx => tx )
            .filter( tx => !tx.blockNumber ) // Are discarded the transactions that were already executed
            .filter( tx => tx.to === idleGame.address )
            .filter( tx => tx.data.slice(0,10) == START_GAME_ENCODED_OPERATION )

        pendingTransactionsTask(startGameTransactions)
        
    }, interval)

}

task(
    "pendingstartgametransactions",
    "Test retrieve of pending startGame transactions.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {
        
        await (new Promise(async () => {

            listenPendingStartGameTransaction(hre, txs => {
                txs.forEach( tx => {
                    const teamId = BigNumber.from(`0x${tx.data.slice(-64)}`)
                    console.log('Pending start game transaction', tx.hash, (tx as any).blockNumber, teamId.toNumber());    
                })
            })
    
        }))

    })

task(
    "iswinner",
    "Checks quantity of won games for teams with the specified battlepoints.",
    async ({ fromblock, toblock, blocksquan, battlepoints }, hre: HardhatRuntimeEnvironment) => {

        const provider = hre.ethers.provider
        const { fromBlock, toBlock } = await getBlocksInterval(hre, fromblock, toblock ? toblock-1800*5 : provider.blockNumber-1800*5, blocksquan)

        const { idleGame } = getCrabadaContracts(hre)

        const startGameEvents = await queryFilterByPage(hre, idleGame, idleGame.filters.StartGame(), fromBlock, toBlock)

        const classNameByCrabada: ClassNameByCrabada = await getClassNameByCrabada(hre)

        let win = 0
        let loose = 0

        await Promise.all(startGameEvents.map(async(e) =>{

            const { gameId, teamId } = e.args

            const gameBattleInfoPromise = idleGame.getGameBattleInfo(gameId)

            const battlePoint: TeamBattlePoints = await TeamBattlePoints.createFromTeamId(idleGame, teamId, classNameByCrabada)

            if (battlePoint != battlepoints)
                return
            
            const { attackTeamId } = await gameBattleInfoPromise

            if ((attackTeamId as BigNumber).isZero())
                win++
            else{

                const attackBattlePoint: TeamBattlePoints = await TeamBattlePoints.createFromTeamId(idleGame, attackTeamId, classNameByCrabada)

                if (battlePoint.gte(attackBattlePoint))
                    win++
                else
                    loose++
            }
                
        }))

        console.log('Win', win)
        console.log('Loose', loose)

    })
    .addOptionalParam("fromblock", "Blocks from.", undefined , types.int)
    .addOptionalParam("toblock", "To from.", undefined , types.int)
    .addOptionalParam("blocksquan", "Quantity ob blocks from fromblock.", 43200 /* 24 hours */ , types.int)
    .addOptionalParam("battlepoints", "Battle points.", 235*3 , types.int)

const OPERATION_ADDRESS = "0xf597AC540730B2c99A31aE1e1362867C4675de2C"

task(
    "approveoperation",
    "Approve account that will transfer the rewards.",
    async ({ operationaddress }, hre: HardhatRuntimeEnvironment) => {
        
        const { tusToken, craToken } = getCrabadaContracts(hre)

        const signers = await hre.ethers.getSigners()

        const override = hre.crabada.network.getOverride()

        for (const signer of signers){

            for (const erc20 of [tusToken, craToken]){

                const allowance: BigNumber = await erc20.allowance(signer.address, operationaddress)

                if (allowance.lt(hre.ethers.constants.MaxUint256.div(2))){

                    await erc20.connect(signer).callStatic.approve(operationaddress, hre.ethers.constants.MaxUint256, override)
                    await logTransactionAndWait(erc20.connect(signer).approve(operationaddress, hre.ethers.constants.MaxUint256, override), 1)

                }

            }

        }

    })
    .addOptionalParam("operationaddress", "Operation account address.", OPERATION_ADDRESS, types.string)

export const withdrawRewards = async (hre: HardhatRuntimeEnvironment, log=console.log) => {

    const { tusToken, craToken } = getCrabadaContracts(hre)

    const signer = (await hre.ethers.getSigners())[0]

    const rewardsTo = signer.address

    const override = hre.crabada.network.getOverride()

    for (const {address: from, teams: { length: teamsQuantity } } of hre.crabada.network.MINE_CONFIG){

        for (const erc20 of [tusToken, craToken]){

                let value: BigNumber = await erc20.balanceOf(from)

                if (erc20.address === tusToken.address)
                    value = value.sub(parseEther(String((20*2*teamsQuantity)))) // Backup value for reinforcements

                if (value.gt(0)){
                    log('erc20.transferFrom(from, rewardsto, value)', from, rewardsTo, formatEther(value));
                    await erc20.connect(signer).callStatic.transferFrom(from, rewardsTo, value, override)
                    await logTransactionAndWait(erc20.connect(signer).transferFrom(from, rewardsTo, value, override), 1, log)
                }

        }

    }

}

task(
    "withdrawrewards",
    "Withdraw rewards to operation account.",
    async ({  }, hre: HardhatRuntimeEnvironment) => {
        
        await withdrawRewards(hre)

    })

export const LOOT_PENDING_AVAX_ACCOUNTS = [
    "0xbfca579D0eB8e294DeAe8C8a94cD3eF3c4836634",
    "0x83Ff016a2e574b2c35d17Fe4302188b192b64344",
    "0x6315F93dEF48c21FFadD5CbE078Cdb19BAA661F8",
    "0xfa310944F9708DE3fd12A999Dfefe9B300C738cF",
    "0xC72F8A49dfb612302c1F4628f12D2795482D6077"
]

export const SETTLER_ACCOUNT = "0xF2108Afb0d7eE93bB418f95F4643Bc4d9C8Eb5e4"
export const REINFORCE_ACCOUNT = "0xBb6d9e4ac8f568E51948BA7d3aEB5a2C417EeB9f"

const LOOTER_TARGET_BALANCE = parseEther('2')
const SETTLER_TARGET_BALANCE = parseEther('6')

export const MINE_MODE = false
export const ATTACK_MODE = !MINE_MODE

export const  refillavax = async (hre: HardhatRuntimeEnvironment, log=console.log ) => {

    const signer = await getSigner(hre)

    const lootPendingAddresses = (MINE_MODE ?
        hre.crabada.network.MINE_CONFIG : hre.crabada.network.LOOT_CAPTCHA_CONFIG.players)
            .map(({address, teams: {length: teamsQuantity}}) => ({ address, teamsQuantity }))

    const override = hre.crabada.network.getOverride()

    const _refillAvax = async (signer: SignerWithAddress, destination: string, targetAmmount: BigNumber) => {
        
        const destinationBalance: BigNumber = await hre.ethers.provider.getBalance(destination);

        const amountToTransfer = targetAmmount.sub(destinationBalance)

        if (amountToTransfer.lte(0))
            return

        log('sendTransaction(to, value)', destination, formatEther(amountToTransfer));

        await logTransactionAndWait(signer.sendTransaction({
            to: destination, 
            value: amountToTransfer,
            ...override
        }), 1, log) 

    }

    for (const {address, teamsQuantity} of lootPendingAddresses){
        const target = MINER_TEAM_TARGET.mul(teamsQuantity)
        await _refillAvax(signer, address, target)
    }
    
    ATTACK_MODE && await _refillAvax(signer, SETTLER_ACCOUNT, SETTLER_TARGET_BALANCE)

}

task(
    "refillavax",
    "Refill accounts with avax.",
    async ({ lootpending, settler, reinforce }, hre: HardhatRuntimeEnvironment) => {

        await refillavax(hre)

    })

task(
    "withdrawteam",
    "Withdraw team members from team owned by signer, to the specified address.",
    async ({ addressto, teamid }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = (await hre.ethers.getSigners())[0]

        await withdrawTeam(hre, signer, addressto, Number(teamid))

    })
    .addParam("addressto", "Account to be sent the team members.", OPERATION_ADDRESS, types.string)
    .addParam("teamid", "Team ID where are going to withdraw its members.", undefined, types.string)

task(
    "withdrawcrabadas",
    "Withdraw crabadas owned by signer, to the specified address.",
    async ({ addressto, crabadas }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = (await hre.ethers.getSigners())[0]

        const override = hre.crabada.network.getOverride()

        await withdraw(hre, signer, addressto, 
            (crabadas as string).split(',').map(x=>BigNumber.from(x)),
            override
        )

    })
    .addParam("addressto", "Account to be sent the team members.", undefined, types.string)
    .addParam("crabadas", "Crabadas IDs, coma separated.", undefined, types.string)


const printTeamStatus = async (hre: HardhatRuntimeEnvironment, team: number) => {

    const { idleGame, tusToken, craToken } = getCrabadaContracts(hre)

    const timestamp = await currentBlockTimeStamp(hre)

    const { crabadaId1, crabadaId2, crabadaId3, timePoint, currentGameId, lockTo } = await idleGame.getTeamInfo(team)
    const battlePoint = await TeamBattlePoints.createFromTeamIdUsingContractForClassNames(hre, team)

    const { attackId1, attackId2, defId1, defId2 } = await idleGame.getGameBattleInfo(currentGameId);

    const { teamId: minerTeam } = await idleGame.getGameBasicInfo(currentGameId)
    const { timePoint: minerTimePoint } = await idleGame.getTeamInfo(minerTeam)
    const minerBattlePoint = await TeamBattlePoints.createFromTeamIdUsingContractForClassNames(hre, minerTeam)

    console.log('Team', team, battlePoint.teamFaction);

    console.log('Team info:')
    console.log('- Members', [crabadaId1, crabadaId2, crabadaId3].map(x=>x.toString()))
    console.log('- bp:', battlePoint.realBP, '| rbp:', battlePoint.getRelativeBP(minerBattlePoint.teamFaction), '| mp:', timePoint)
    console.log('- Current Game:', currentGameId.toString())
    console.log('- Seconds to unlock', lockTo-timestamp)

    console.log('Game info:')
    console.log('- Attack crabada reinforcements', attackId1.toString(), attackId2.toString())
    console.log('- Defense crabada reinforcements', defId1.toString(), defId2.toString())

    console.log('Other team info:')
    console.log('Team ID', minerTeam.toString(), minerBattlePoint.teamFaction)
    console.log('- bp:', minerBattlePoint.realBP, '| rbp:', minerBattlePoint.getRelativeBP(battlePoint.teamFaction), '| mp:', minerTimePoint)

}

interface IDashboardAvaxAccount {
    address: string,
    balance: string
}

interface IDashboardAvax {
    avaxConsumed: string,
    looters?: IDashboardAvaxAccount[],
    settler?: IDashboardAvaxAccount,
    reinforcer?: IDashboardAvaxAccount,
    miners?: IDashboardAvaxAccount[],
}

interface IDashboardTeamProps {
    bp:number,
    rbp: number,
    mp: number
}

interface IDashboardTeam {
    id: string,
    faction: TeamFaction,
    info: {
        members: string[],
        props: IDashboardTeamProps,
        currentGame: string,
        secondsToUnlock: number,
        gameInfo: {
            attackReinforcements: string[],
            defenseReinforcements: string[],
            otherTeam: {
                id: string,
                faction: TeamFaction,
                props: IDashboardTeamProps,
            },
            minersRevenge?: number
        }
    }
}

interface IDashboardPlayer{
    rewards: IDashboardRewards,
    address: string,
    teams: IDashboardTeam[]
}

interface IDashboardRewards{
    TUS: string,
    CRA: string
}

interface IDashboardContent {
    avax: IDashboardAvax,
    rewards: IDashboardRewards,
    players: IDashboardPlayer[],
}

export const getDashboardContent = async (hre: HardhatRuntimeEnvironment): Promise<IDashboardContent> => {

    const getDashboardAvax = async (hre: HardhatRuntimeEnvironment): Promise<IDashboardAvax> => {
            
        let avaxConsumed = SETTLER_TARGET_BALANCE
            // .add(REINFORCE_TARGET_BALANCE)
            .add(
                MINER_TEAM_TARGET.mul(
                    hre.crabada.network.MINE_CONFIG.reduce( 
                        (prev, {teams: {length: teamsQuantity}}) => prev+teamsQuantity, 
                        0
                    ) 
                )
            )
        
        const getAvaxBalance = async (address: string): Promise<IDashboardAvaxAccount> => {
            return {
                address,
                balance: formatEther(await hre.ethers.provider.getBalance(address))
            }
        }

        const lootersPromise: Promise<IDashboardAvaxAccount[]> = Promise.all(
            hre.crabada.network.LOOT_CAPTCHA_CONFIG.players.map(p => p.address).map(getAvaxBalance)
        )

        const settlerPromise = getAvaxBalance(SETTLER_ACCOUNT)

        //const reinforcerPromise = getAvaxBalance(REINFORCE_ACCOUNT)

        const looters = await lootersPromise
        const settler = await settlerPromise
        //const reinforcer = await reinforcerPromise

        const avax: IDashboardAvax = {
            avaxConsumed: formatEther(avaxConsumed
                .sub(looters.reduce((prev: BigNumber, { balance }) => prev.add(parseEther(balance)), ethers.constants.Zero))
                .sub(parseEther(settler.balance))
                //.sub(parseEther(reinforcer.balance))
                ),
            looters,
            settler,
            //reinforcer
        }

        return avax
    }

    const { tusToken, craToken } = getCrabadaContracts(hre)

    const getDashboardPlayers =async (hre: HardhatRuntimeEnvironment): Promise<IDashboardPlayer[]> => {

        return Promise.all(
            hre.crabada.network.LOOT_CAPTCHA_CONFIG.players.map( async (player): Promise<IDashboardPlayer> => {

                const playerTusBalancePromise: Promise<BigNumber> = tusToken.balanceOf(player.address)
                    
                const playerCraBalancePromise = craToken.balanceOf(player.address)
    
                const teamsPromise: Promise<IDashboardTeam[]> = Promise.all(
                    player.teams.map(async (team): Promise<IDashboardTeam> => {
                        const { idleGame } = getCrabadaContracts(hre)

                        const timestamp = await currentBlockTimeStamp(hre)
                    
                        const { crabadaId1, crabadaId2, crabadaId3, timePoint, currentGameId, lockTo } = await idleGame.getTeamInfo(team)
                        const battlePoint = await TeamBattlePoints.createFromTeamIdUsingContractForClassNames(hre, team)
                    
                        const { attackId1, attackId2, defId1, defId2 } = await idleGame.getGameBattleInfo(currentGameId);
                    
                        const { teamId: minerTeam } = await idleGame.getGameBasicInfo(currentGameId)
                        const { timePoint: minerTimePoint } = await idleGame.getTeamInfo(minerTeam)
                        const minerBattlePoint = await TeamBattlePoints.createFromTeamIdUsingContractForClassNames(hre, minerTeam)
                    
                        return {
                            id: String(team),
                            faction: battlePoint.teamFaction,
                            info: {
                                members: [crabadaId1, crabadaId2, crabadaId3].map(x=>x.toString()),
                                props: {
                                    bp: battlePoint.realBP,
                                    rbp: battlePoint.getRelativeBP(minerBattlePoint.teamFaction),
                                    mp:timePoint
                                },
                                currentGame: currentGameId.toString(),
                                secondsToUnlock: lockTo-timestamp,
                                gameInfo:{
                                    attackReinforcements: [attackId1.toString(), attackId2.toString()],
                                    defenseReinforcements: [defId1.toString(), defId2.toString()],
                                    otherTeam: {
                                        id: minerTeam.toString(),
                                        faction: minerBattlePoint.teamFaction,
                                        props: {
                                            bp: minerBattlePoint.realBP,
                                            rbp: minerBattlePoint.getRelativeBP(battlePoint.teamFaction),
                                            mp: minerTimePoint
                                        }
                                    }
                                },

                            }
                        }

                    })
                )
    
                return {
                    address: player.address,
                    rewards: {
                        TUS: formatEther((await playerTusBalancePromise).sub(PLAYER_TUS_RESERVE)),
                        CRA: formatEther(await playerCraBalancePromise)
                    },
                    teams: await teamsPromise
                }
                
            })
        )

    }

    const avaxPromise: Promise<IDashboardAvax> = getDashboardAvax(hre)
    const players: IDashboardPlayer[] = await getDashboardPlayers(hre)

    return {
        avax: await avaxPromise,
        rewards: {
            TUS: formatEther(
                players.reduce(
                    (prev, { rewards: { TUS }}) => prev.add(parseEther(TUS)), 
                    ethers.constants.Zero
                )
            ),
            CRA: formatEther(
                players.reduce(
                    (prev, { rewards: { CRA }}) => prev.add(parseEther(CRA)), 
                    ethers.constants.Zero
                )
            )
        },
        players,
    }

}

const MINER_TEAM_TARGET = parseEther('0.8')

export const getMineDashboardContent = async (hre: HardhatRuntimeEnvironment): Promise<IDashboardContent> => {

    const getDashboardAvax = async (hre: HardhatRuntimeEnvironment): Promise<IDashboardAvax> => {
            
        let avaxConsumed = MINER_TEAM_TARGET.mul(
            hre.crabada.network.MINE_CONFIG.reduce( 
                (prev, {teams: {length: teamsQuantity}}) => prev+teamsQuantity, 
                0
            ) 
        )
        
        const getAvaxBalance = async (address: string): Promise<IDashboardAvaxAccount> => {
            return {
                address,
                balance: formatEther(await hre.ethers.provider.getBalance(address))
            }
        }

        const balances: IDashboardAvaxAccount[] = await Promise.all(
            hre.crabada.network.MINE_CONFIG
                .map(({address})=>address)
                .map(getAvaxBalance)
        )

        const avax: IDashboardAvax = {
            avaxConsumed: formatEther(avaxConsumed
                .sub(balances.reduce((prev: BigNumber, { balance }) => prev.add(parseEther(balance)), ethers.constants.Zero))
                ),
            miners: balances,
        }

        return avax
    }

    const { tusToken, craToken } = getCrabadaContracts(hre)

    const getDashboardPlayers =async (hre: HardhatRuntimeEnvironment): Promise<IDashboardPlayer[]> => {

        return Promise.all(
            hre.crabada.network.MINE_CONFIG.map( async (player): Promise<IDashboardPlayer> => {

                const playerTusBalancePromise: Promise<BigNumber> = tusToken.balanceOf(player.address)
                    
                const playerCraBalancePromise = craToken.balanceOf(player.address)
    
                const teamsPromise: Promise<IDashboardTeam[]> = Promise.all(
                    player.teams.map(async (team): Promise<IDashboardTeam> => {
                        const { idleGame } = getCrabadaContracts(hre)

                        const timestamp = await currentBlockTimeStamp(hre)
                    
                        const { crabadaId1, crabadaId2, crabadaId3, timePoint, currentGameId, lockTo } = await idleGame.getTeamInfo(team)
                        const battlePoint = await TeamBattlePoints.createFromTeamIdUsingContractForClassNames(hre, team)
                    
                        const { attackTeamId, attackId1, attackId2, defId1, defId2 } = await idleGame.getGameBattleInfo(currentGameId);
                    
                        const { timePoint: attackerTimePoint } = await idleGame.getTeamInfo(attackTeamId)
                        const attackerBattlePoint = await TeamBattlePoints.createFromTeamIdUsingContractForClassNames(hre, attackTeamId)
                    
                        const sum = (prev, current) => prev+current
                    
                        const attackReinforceBattlePoint = (await Promise.all([ attackId1, attackId2 ].map(x => hre.crabada.api.crabadaIdToBattlePointPromise(x))))
                            .reduce(sum,0)
                        
                        const defenseReinforceBattlePoint = (await Promise.all([ defId1, defId2 ].map(x => hre.crabada.api.crabadaIdToBattlePointPromise(x))))
                            .reduce(sum,0)

                        const defenseReinforceMinePoint = (await Promise.all([ defId1, defId2 ].map( x => hre.crabada.api.crabadaIdToMinePointPromise(x))))
                            .reduce(sum,0)

                        const bpDiff = attackerBattlePoint.getRelativeBP(battlePoint.teamFaction)+attackReinforceBattlePoint
                            -battlePoint.getRelativeBP(attackerBattlePoint.teamFaction)-defenseReinforceBattlePoint

                        const calcMinersRevenge = (defenseMP: number, diffBP: number): number => {
                            return bpDiff <=0 ? 
                                100 :
                                Math.min(
                                    Math.floor(
                                        ( 7 + (((defenseMP)/5)-56)*1.25
                                            + 20/(diffBP**0.5) ) 
                                        * 100
                                    ) / 100,
                                    40
                                )  
                        }

                        const minersRevenge = calcMinersRevenge(timePoint+defenseReinforceMinePoint, bpDiff)

                        return {
                            id: String(team),
                            faction: battlePoint.teamFaction,
                            info: {
                                members: [crabadaId1, crabadaId2, crabadaId3].map(x=>x.toString()),
                                props: {
                                    bp: battlePoint.realBP,
                                    rbp: battlePoint.getRelativeBP(attackerBattlePoint.teamFaction),
                                    mp:timePoint
                                },
                                currentGame: currentGameId.toString(),
                                secondsToUnlock: lockTo-timestamp,
                                gameInfo:{
                                    attackReinforcements: [attackId1.toString(), attackId2.toString()],
                                    defenseReinforcements: [defId1.toString(), defId2.toString()],
                                    otherTeam: {
                                        id: attackTeamId.toString(),
                                        faction: attackerBattlePoint.teamFaction,
                                        props: {
                                            bp: attackerBattlePoint.realBP,
                                            rbp: attackerBattlePoint.getRelativeBP(battlePoint.teamFaction),
                                            mp: attackerTimePoint
                                        }
                                    },
                                    minersRevenge
                                },

                            }
                        }

                    })
                )
    
                return {
                    address: player.address,
                    rewards: {
                        TUS: formatEther((await playerTusBalancePromise).sub(PLAYER_TUS_RESERVE)),
                        CRA: formatEther(await playerCraBalancePromise)
                    },
                    teams: await teamsPromise
                }
                
            })
        )

    }

    const avaxPromise: Promise<IDashboardAvax> = getDashboardAvax(hre)
    const players: IDashboardPlayer[] = await getDashboardPlayers(hre)

    return {
        avax: await avaxPromise,
        rewards: {
            TUS: formatEther(
                players.reduce(
                    (prev, { rewards: { TUS }}) => prev.add(parseEther(TUS)), 
                    ethers.constants.Zero
                )
            ),
            CRA: formatEther(
                players.reduce(
                    (prev, { rewards: { CRA }}) => prev.add(parseEther(CRA)), 
                    ethers.constants.Zero
                )
            )
        },
        players,
    }

}

export const getDashboard = MINE_MODE ? getMineDashboardContent : getDashboardContent

task(
    "dashboard",
    "Display dashboard with team status.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {

        const dashboard = await getDashboardContent(hre)

        console.log('LOOT_PENDING_AVAX_ACCOUNTS');

        for (const { address, balance } of dashboard.avax.looters){
            console.log('-', address, balance);
        }

        console.log('SETTLER_ACCOUNT');
        console.log('-', dashboard.avax.settler.address, dashboard.avax.settler.balance);

        // console.log('REINFORCE_ACCOUNT');
        // console.log('-', dashboard.avax.reinforcer.address, dashboard.avax.reinforcer.balance);

        console.log('')

        for (const player of dashboard.players){

            console.log('')

            console.log('Player contract', player.address);
            console.log('TUS', player.rewards.TUS);
            console.log('CRA', player.rewards.CRA);

            for (const team of player.teams){

                console.log('')

                console.log('Team', team.id, team.faction);

                console.log('Team info:')
                console.log('- Members', team.info.members)
                console.log('- bp:', team.info.props.bp, '| rbp:', team.info.props.rbp, '| mp:', team.info.props.mp)
                console.log('- Current Game:', team.info.currentGame)
                console.log('- Seconds to unlock', team.info.secondsToUnlock)
            
                console.log('Game info:')
                console.log('- Attack crabada reinforcements', team.info.gameInfo.attackReinforcements)
                console.log('- Defense crabada reinforcements', team.info.gameInfo.defenseReinforcements)
            
                console.log('Other team info:')
                console.log('Team ID', team.info.gameInfo.otherTeam.id, team.info.gameInfo.otherTeam.faction)
                console.log('- bp:', team.info.gameInfo.otherTeam.props.bp, '| rbp:', team.info.gameInfo.otherTeam.props.rbp, '| mp:', team.info.gameInfo.otherTeam.props.mp)

            }

        }

        console.log('');
        console.log('avaxConsumed', dashboard.avax.avaxConsumed);

        console.log('')
        console.log('TUS Balance:', dashboard.rewards.TUS)
        console.log('CRA Balance:', dashboard.rewards.CRA)

    })


task(
    "minedashboard",
    "Display dashboard with team status.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {

        const dashboard = await getMineDashboardContent(hre)

        console.log('MINE_AVAX_ACCOUNTS');

        for (const { address, balance } of dashboard.avax.miners){
            console.log('-', address, balance);
        }

        console.log('')

        for (const player of dashboard.players){

            console.log('')

            console.log('Player address', player.address);
            console.log('TUS', player.rewards.TUS);
            console.log('CRA', player.rewards.CRA);

            for (const team of player.teams){

                console.log('')

                console.log('Team', team.id, team.faction);

                console.log('Team info:')
                console.log('- Members', team.info.members)
                console.log('- bp:', team.info.props.bp, '| rbp:', team.info.props.rbp, '| mp:', team.info.props.mp)
                console.log('- Current Game:', team.info.currentGame)
                console.log('- Seconds to unlock', team.info.secondsToUnlock)
            
                console.log('Game info:')
                console.log('- Attack crabada reinforcements', team.info.gameInfo.attackReinforcements)
                console.log('- Defense crabada reinforcements', team.info.gameInfo.defenseReinforcements)
                console.log("- Miner's revange %", team.info.gameInfo.minersRevenge)
            
                console.log('Other team info:')
                console.log('Team ID', team.info.gameInfo.otherTeam.id, team.info.gameInfo.otherTeam.faction)
                console.log('- bp:', team.info.gameInfo.otherTeam.props.bp, '| rbp:', team.info.gameInfo.otherTeam.props.rbp, '| mp:', team.info.gameInfo.otherTeam.props.mp)

            }

        }

        console.log('');
        console.log('avaxConsumed', dashboard.avax.avaxConsumed);

        console.log('')
        console.log('TUS Balance:', dashboard.rewards.TUS)
        console.log('CRA Balance:', dashboard.rewards.CRA)

    })



task(
    "teamstatus",
    "Display team status.",
    async ({ team }, hre: HardhatRuntimeEnvironment) => {

        await printTeamStatus(hre, team)

    })
    .addParam("team", "Team ID.", undefined, types.int)

