import { task } from "hardhat/config";

import { formatEther, formatUnits, parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { attachAttackRouter, baseFee, CloseDistanceToStartByTeamId, closeGameToStartGameDistances, compareBigNumbers, compareBigNumbersDescending, fightDistanceDistribution, gasPrice, getCloseDistanceToStartByTeamId, getCrabadaContracts, getOverride, getPercentualStepDistribution, getPossibleTargetsByTeamId, getTeamsBattlePoint, getTeamsThatPlayToLooseByTeamId, isTeamLocked, locked, loot, MAX_FEE, mineStep, MIN_VALID_BATTLE_POINTS, ONE_GWEI, queryFilterByPage, reinforce, settleGame, StepMaxValuesByPercentage, updateTeamsThatWereChaged } from "../scripts/crabada";
import { types } from "hardhat/config"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract, ethers } from "ethers";
import { AccountConfig, CONFIG_BY_NODE_ID, looter1, looter2, main, NodeConfig,  } from "../config/nodes";

import "./player"

task("basefee", "Get the base fee", async (args, hre): Promise<void> => {
    console.log(formatUnits(await baseFee(hre), 9))
})
  
task("gasprice", "Get the base fee", async (args, hre): Promise<void> => {
    console.log(formatUnits(await gasPrice(hre), 9))
})

export const getSigner = async (hre: HardhatRuntimeEnvironment, testaccount: string, signerIndex: number = 0): Promise<SignerWithAddress> => {
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

// npx hardhat minestep --network localhost --minerteamid 3286 --attackercontract 0x74185cE8C16392C19CDe0F132c4bA6aC91dFcA02 --attackerteamid 3785 --wait 1 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
task(
    "minestep",
    "Mine step: If mining, try to close game. Then, if not mining, create a game.",
    async ({ minerteamid, attackercontract, attackerteamid, wait, testmineraccount, testattackeraccounts, accountindex }, hre: HardhatRuntimeEnvironment) => {
        
        const minerSigner = await getSigner(hre, testmineraccount, accountindex);
        const attackSigners = attackerteamid ?
            testattackeraccounts ? 
                (await Promise.all((testattackeraccounts as string).split(',').map( testattackeraccount => getSigner(hre, testattackeraccount) )))
                : (await hre.ethers.getSigners()).slice(accountindex+1)
            : []

        try {
            await mineStep(hre, minerteamid, attackercontract, attackerteamid, wait, minerSigner, attackSigners)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
        }

    })
    .addParam("minerteamid", "The team ID to use for mining.")
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
        const { owner, currentGameId: gameId3, crabadaId1: c1, crabadaId2: c2, crabadaId3: c3 } = teamInfo
        console.log(owner);
        console.log([c1, c2, c3].map( (x:BigNumber) => x.toNumber() ));

    })
    .addParam("teamid", "Team ID.", undefined, types.int)


task(
    "settlegame",
    "Settle game id.",
    async ({ player, teamid, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const { idleGame } = getCrabadaContracts(hre)

        const { currentGameId } = await idleGame.getTeamInfo(teamid)

        await settleGame(idleGame.connect(signer), currentGameId, 3)

    })
    .addParam("teamid", "Team ID which have a game to settle.", undefined, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)


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

task(
    "lootpossibletargets",
    "Loot process.",
    async ({ blockstoanalyze, firstdefendwindow, maxbattlepoints }, hre: HardhatRuntimeEnvironment) => {

        console.log('Analyzed blocks', blockstoanalyze);
        console.log('First defend window in blocks', firstdefendwindow);
        console.log('Target´s max. battle points', maxbattlepoints);
        
        const possibleTargetsByTeamId = await getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow)

        // It is obtained the distribution of the attack points.

        const attackPointsDist = Array.from(Array(10).keys()).map(x=>0)
        let targetsBelowMaxBattlePoints = 0

        Object.keys(possibleTargetsByTeamId).map( async (teamId) => {
            if (possibleTargetsByTeamId[teamId].battlePoint<maxbattlepoints)
                targetsBelowMaxBattlePoints++
            const index = Math.floor( (possibleTargetsByTeamId[teamId].battlePoint - MIN_BATTLE_POINTS) / STEP_BATTLE_POINTS )
            attackPointsDist[index]++
        })

        console.log('Targets below ', maxbattlepoints, 'battle points:', targetsBelowMaxBattlePoints);

        console.log('attackPointsDist', attackPointsDist
            .map( (q, index) => ({ [`${MIN_BATTLE_POINTS+STEP_BATTLE_POINTS*(index)} - ${MIN_BATTLE_POINTS+STEP_BATTLE_POINTS*(index+1)}`]: q }))
        )

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 3600 /*2 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("maxbattlepoints", "Maximum battle points for a target.", 621, types.int)

task(
    "fightdistance",
    "Distribution of number of blocks between StartGame and Fight events for teams that play to loose with battle points up to maxbattlepoints.",
    async ({ blockstoanalyze, firstdefendwindow, maxbattlepoints }, hre: HardhatRuntimeEnvironment) => {

        const possibleTargetsByTeamId = await getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow)

        console.log('Teams that play to loose', Object.keys(possibleTargetsByTeamId)
            .filter( teamId => possibleTargetsByTeamId[teamId].battlePoint>=MIN_VALID_BATTLE_POINTS)
            .filter( teamId => possibleTargetsByTeamId[teamId].battlePoint<=maxbattlepoints)
            .length, 'below', maxbattlepoints, 'battle points'
            );

        const fightDistanceDist = await fightDistanceDistribution(hre, blockstoanalyze, possibleTargetsByTeamId, maxbattlepoints)
        
        console.log('fightDistanceDist', fightDistanceDist)

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 43200 /*2 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("maxbattlepoints", "Maximum battle points for a target.", 621, types.int)

task(
    "startgamedistance",
    "Distribution of number of blocks in step between CloseGame and StartGame events for teams that play to loose with battle points up to maxbattlepoints.",
    async ({ blockstoanalyze, firstdefendwindow, maxbattlepoints, steps }, hre: HardhatRuntimeEnvironment) => {

        const possibleTargetsByTeamId = await getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow)

        console.log('Teams that play to loose', Object.keys(possibleTargetsByTeamId)
            .filter( teamId => possibleTargetsByTeamId[teamId].battlePoint>=MIN_VALID_BATTLE_POINTS)
            .filter( teamId => possibleTargetsByTeamId[teamId].battlePoint<=maxbattlepoints)
            .length, 'below', maxbattlepoints, 'battle points'
            );

        const distances = await closeGameToStartGameDistances(hre, blockstoanalyze, possibleTargetsByTeamId, maxbattlepoints)
        
        console.log('Distances found', distances.length);
        

        const stepsDistributionDistances: StepMaxValuesByPercentage = getPercentualStepDistribution(
            distances, steps)

        console.log('Percentual distribution for distances between CloseGame and StartGame events', stepsDistributionDistances);

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 43200 /*2 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("maxbattlepoints", "Maximum battle points for a target.", 621, types.int)
    .addOptionalParam("steps", "Step to consider in the distance analysis.", 10 , types.int)


export const areAllTeamsLocked = async (hre: HardhatRuntimeEnvironment, idleGame: Contract, lootersTeams: number[]) => {
    return (await Promise.all(
        lootersTeams.map( async(looterteamid): Promise<boolean> => await isTeamLocked(hre, idleGame, looterteamid)) 
        )).every( locked => locked )
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

        const teamsThatPlayToLooseByTeamId = await (
            nodeConfig.lootConfig.attackOnlyTeamsThatPlayToLoose ? 
                getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow)
                : getTeamsBattlePoint(hre, blockstoanalyze)
        )

        await updateTeamsThatWereChaged(hre, teamsThatPlayToLooseByTeamId, blockstoanalyze)

        const updateTeamBattlePointListener = async (teamId: BigNumber)=>{
            if (!teamsThatPlayToLooseByTeamId[teamId.toString()])
                return
            const { battlePoint } = await idleGame.getTeamInfo(teamId)
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
    
                    const { battlePoint } = await idleGame.getTeamInfo(looterTeamId)
    
                    await loot(hre, teamsThatPlayToLooseByTeamId, looterTeamId, signer, console.log, testmode);    
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
    /*main,*/
    looter1,
    looter2,
]

task(
    "reinforce",
    "Reinforce process.",
    async ({ testaccount, testmode }, hre: HardhatRuntimeEnvironment) => {

        for (const {accountIndex, teams} of REINFORCE_CONFIG){

            const signer = await getSigner(hre, testaccount, accountIndex)

            console.log('Reinforce for signer', signer.address);

            for (const looterTeamId of teams){
    
                console.log('Reinforce for team id', looterTeamId);

                try {

                    const tr = await reinforce(hre, looterTeamId, signer, console.log, testmode);

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

task(
    "lootpending",
    "Loot pending startGame transactions.",
    async ({ blockstoanalyze, firstdefendwindow, testaccount, testmode, debug }, hre: HardhatRuntimeEnvironment) => {

        // signer used to settle
        const settleSigner = await getSigner(hre, testaccount)

        const lootersSigners = (await hre.ethers.getSigners()).slice(1)

        const lootPendingConfig: LootPendingConfig = {
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
                    maxPriorityFeePerGas: BigNumber.from(ONE_GWEI*50)
                }
            },        
            players: [
                {
                    address: '0xb972ADCAc416Fe6e6a3330c5c374b97046013796',
                    teams: [10471, 10472, 10515]
                },
            ]
        }

        const { idleGame } = getCrabadaContracts(hre)
        const router: Contract | undefined = 
            lootPendingConfig.router.address ? 
                await attachAttackRouter(hre, lootPendingConfig.router.address)
                : undefined

        // Verify there are teams in the config.

        const lootersTeams = lootPendingConfig.players.map( p => p.teams ).flat()

        if (lootersTeams.length == 0)
            return

        // Initialize Player/Team data structure

        interface PlayerTeamPair {
            playerAddress: string,
            teamId: number,
            locked: boolean,
            battlePoint: number,
        }

        const playerTeamPairs: PlayerTeamPair[] = await Promise.all(lootPendingConfig.players
            .map( p => p.teams
                .map( async(teamId) => {
                    const { battlePoint } = await idleGame.getTeamInfo(teamId)
                    return ({
                        playerAddress: p.address,
                        teamId,
                        locked: true,
                        battlePoint,
                    })
                })
            )
            .flat())
        
        
        // Initialize teams' lock status

        const updateLockStatus = async (hre: HardhatRuntimeEnvironment, idleGame: Contract, playerTeamPairs: PlayerTeamPair[], log: (typeof console.log)) => {
            return (await Promise.all(
                playerTeamPairs.map( async(playerTeamPair): Promise<any> => {
                    playerTeamPair.locked = !testmode && await isTeamLocked(hre, idleGame, playerTeamPair.teamId, log)
                }) 
            ))
        }

        await updateLockStatus(hre, idleGame, playerTeamPairs, console.log)

        // Sets interval to settleGame for unlocked teams.
        
        let settleInProgress = false

        const settleGames = async(log: (typeof console.log))=>{

            if (settleInProgress)
                return

            settleInProgress = true

            try {

                for (const p of playerTeamPairs.filter(p=>!p.locked)){
                    const { currentGameId } = await idleGame.getTeamInfo(BigNumber.from(p.teamId))
                    await settleGame(idleGame.connect(settleSigner), currentGameId, 1, ()=>{})
                }
                    
            } catch (error) {

                // To be possible to deactivate settleInProgress
                
            }

            settleInProgress = false

        }

        !testmode && (await settleGames(console.log))

        const settleGameInterval = !testmode && setInterval(() => settleGames(()=>{}), 2000)


        // Verify if all teams are locked.

        const areAllPlayerTeamPairsLocked = (playerTeamPairs: PlayerTeamPair[]): boolean => {
            return playerTeamPairs.map( ({ locked }) => locked ).every( locked => locked )
        }

        if ( !testmode && (areAllPlayerTeamPairsLocked(playerTeamPairs)) )
            return

        
        // Teams that play to loose...

        const teamsThatPlayToLooseByTeamId = await getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow)


        // Update teams thar were changed and set interval to update regularly...

        await updateTeamsThatWereChaged(hre, teamsThatPlayToLooseByTeamId, blockstoanalyze)

        const updateTeamBattlePointListener = async (teamId: BigNumber)=>{
            if (!teamsThatPlayToLooseByTeamId[teamId.toString()])
                return
            const { battlePoint } = await idleGame.getTeamInfo(teamId)
            console.log('Team', teamId.toString(), 'updated battlePoint, from', 
                teamsThatPlayToLooseByTeamId[teamId.toString()].battlePoint, 'to', battlePoint);
            teamsThatPlayToLooseByTeamId[teamId.toString()].battlePoint = battlePoint
        }

        idleGame.on(idleGame.filters.AddCrabada(), updateTeamBattlePointListener)


        // Set interval for updating teams' lock status.

        const updateLockStatusInterval = setInterval(() => updateLockStatus(hre, idleGame, playerTeamPairs, ()=>{}), 2000);

        // Listen for CloseGame events to register team for looting

        interface StartGameTargets {
            teamId: BigNumber,
            attacksPerformed: number,
        }

        interface StartedGameTargetsByTeamId {
            [teamId:string]: StartGameTargets
        }

        const startedGameTargetsByTeamId: StartedGameTargetsByTeamId = {}

        let attackIteration = 0

        const addTeamToLootTargets = (txs: ethers.Transaction[]) => {

            if (txs.length == 0){
                return
            }

            txs.forEach( tx => {

                const teamId = BigNumber.from(`0x${tx.data.slice(-64)}`)
                console.log('Pending start game transaction', tx.hash, (tx as any).blockNumber, teamId.toNumber());
    
                const targetTeamInfo = teamsThatPlayToLooseByTeamId[teamId.toString()]
    
                if (!targetTeamInfo){
                    debug && console.log('Discarded, team does not play to loose.', teamId.toString());
                    return
                }
    
                if (!targetTeamInfo.battlePoint){
                    debug && console.log('Discarded, team with no battlePointdefined.', teamId.toString());
                    return
                }
    
                const pairsStrongerThanTarget = playerTeamPairs.filter( p => p.battlePoint > targetTeamInfo.battlePoint)
    
                if (pairsStrongerThanTarget.length == 0){
                    debug && console.log('Discarded, no stronger team for attack. (teamId, playerTeamPairs.battlePoint, target.battlePoint)', 
                        teamId.toString(), playerTeamPairs.map(p=>p.battlePoint), targetTeamInfo.battlePoint);
                    return
                }
    
                startedGameTargetsByTeamId[teamId.toString()] = {
                    teamId,
                    attacksPerformed: 0,
                }
    
                // TODO Verify if attack imediately it is needed.
    
                console.log('Pending startGame', tx.hash, 
                    'Added team to loot targets', teamId.toNumber()
                );
    
            })
            
            attackTeams()
        }

        const pendingStartGameTransactionInterval = await listenPendingStartGameTransaction(hre, addTeamToLootTargets)


        // Set interval to verify if a possible target should be removed considering
        // the following conditions are met:
        // 1) game is already looted (use getGameBattleInfo and get status)
        // 2) currentBlock-closeGameBlock > maxBlocksPerTarget

        const LOOTGUESS_MAX_ATTACKS_PER_TARGET = 1

        const removeCloseGameTargetsInterval = setInterval(() => {

            Object.keys(startedGameTargetsByTeamId).forEach( async(teamId) => {

                const startedGameTarget = startedGameTargetsByTeamId[teamId]

                if (startedGameTarget.attacksPerformed >= LOOTGUESS_MAX_ATTACKS_PER_TARGET){
                    delete startedGameTargetsByTeamId[teamId]
                    return
                }

                const { currentGameId } = await idleGame.getTeamInfo(BigNumber.from(teamId))

                if (!(currentGameId as BigNumber).isZero()){

                    const { attackTeamId } = await idleGame.getGameBattleInfo(currentGameId)

                    // Validate if game is already looted
                    if (!(attackTeamId as BigNumber).isZero()){

                        delete startedGameTargetsByTeamId[teamId]
                        return
                    }

                }

            })

        }, 500)


        // Main interval to perform attacks considering the following conditions:
        // 1) Apply only for looter teams are unlocked
        // 2) Targets should have battlePoint lower than the maximum looterTeam target battlePoint.
        // 3) For targets currentBlockNumber-closeGameBlockNumber >= minBlocknumberDistance-2
        // 4) Apply only for looter teams that have battlePoint higher than minimum target battlePoint.

        const attackTeams = async () => {

            // 1) Apply only for looter teams are unlocked
            const unlockedPlayerTeamPairs = playerTeamPairs.filter( p => !p.locked || testmode )

            if (unlockedPlayerTeamPairs.length == 0){
                console.log('Attack Interval', 'No unlocked looter teams');
                return
            }

            // Get the max battlePoint for unlocked looter teams.
            const maxUnlockedLooterBattlePoint = Math.max(
                ...unlockedPlayerTeamPairs
                    .map( playerTeamPair => playerTeamPair.battlePoint )
            )

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
                    
                    if (targetInfo.battlePoint >= maxUnlockedLooterBattlePoint){
                        debug && console.log('Attack Interval', 'Team', Number(teamId), 'has higher battlePoint', 
                        targetInfo.battlePoint, 'than', maxUnlockedLooterBattlePoint);
                        return false
                    }
                    
                    return true
                })

                // 3) Targets should not be attacked more than max times
                .filter(teamId => {

                    const startedGameTarget = startedGameTargetsByTeamId[teamId]

                    if (startedGameTarget.attacksPerformed > LOOTGUESS_MAX_ATTACKS_PER_TARGET){
                        debug && console.log('Max attacks per target achieved', '(attacksPerformed, max)', 
                            startedGameTarget.attacksPerformed, LOOTGUESS_MAX_ATTACKS_PER_TARGET);
                        return false
                    }

                    return true

                })
            
            if (teamIdTargets.length == 0){
                return
            }

            const minTargetBattlePoint = Math.min(
                ...teamIdTargets.map( teamId => teamsThatPlayToLooseByTeamId[teamId].battlePoint )
            )

            // 4) Apply only for looter teams that have battlePoint higher than minimum target battlePoint.
            const unlockedPlayerTeamPairsWithEnoughBattlePoint =
                unlockedPlayerTeamPairs.filter( p => p.battlePoint > minTargetBattlePoint )

            if (unlockedPlayerTeamPairsWithEnoughBattlePoint.length == 0){
                console.log('Attack Interval', 'No unlocked looter teams with enough battle points', 
                    unlockedPlayerTeamPairs.map( p => p.battlePoint), '<=', minTargetBattlePoint)
                return
            }

            const unlockedPlayerTeamPairsWithEnoughBattlePointSorted =
                unlockedPlayerTeamPairsWithEnoughBattlePoint.sort( (a,b) => 
                    a.battlePoint < b.battlePoint ? -1 : a.battlePoint > b.battlePoint ? 1 : 0
                )

            const looterSignerIndex = attackIteration % lootersSigners.length
            attackIteration++

            const playerAddresses = unlockedPlayerTeamPairsWithEnoughBattlePointSorted.map(p=>p.playerAddress)
            const looterTeams = unlockedPlayerTeamPairsWithEnoughBattlePointSorted.map(p=>p.teamId)
            const looterBattlePoint = unlockedPlayerTeamPairsWithEnoughBattlePointSorted.map(p=>p.battlePoint)
            const targetBattlePoint = teamIdTargets.map(teamId => teamsThatPlayToLooseByTeamId[teamId].battlePoint)

            console.log(
                +new Date()/1000,
                'attackTeams(', 
                'players=', playerAddresses.toString(),
                'looterTeams=', looterTeams.toString(),
                'looterBattlePoint=', looterBattlePoint.toString(),
                'targetTeams=', teamIdTargets.toString(),
                'targetBattlePoint=', targetBattlePoint.toString(),
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
                    looterBattlePoint,
                    teamIdTargets,
                    targetBattlePoint,
                    lootPendingConfig.attackTransaction.override
                )

                if (transactionResponse && (transactionResponse.hash || transactionResponse.blockNumber))
                    console.log('router.attackTeams', 'transaction hash', transactionResponse.hash, 'blocknumber', transactionResponse.blockNumber);

            } catch (error) {

                console.error('ERROR', 'router.attackTeams', String(error));
                
            }

        }

        //const attackTeamsInterval = setInterval(attackTeams, 1000)

        // TODO Verify if finish needed.
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

        //clearInterval(attackTeamsInterval)
        clearInterval(pendingStartGameTransactionInterval)
        idleGame.off(idleGame.filters.AddCrabada(), updateTeamBattlePointListener)
        clearInterval(updateLockStatusInterval)
        settleGameInterval && clearInterval(settleGameInterval)
        clearInterval(removeCloseGameTargetsInterval)

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 43200 /*24 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)
    .addOptionalParam("testmode", "Test mode", true, types.boolean)
    .addOptionalParam("debug", "Debug mode", false, types.boolean)

    
export const START_GAME_ENCODED_OPERATION = '0xe5ed1d59'
export const START_GAME_EVENT_TOPIC ='0x0eef6f7452b7d2ee11184579c086fb47626e796a83df2b2e16254df60ab761eb'

task(
    "meassurestartgameevents",
    "Listen StartGame events and meassure the time between block and event reception.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {
        
        await (new Promise(async () => {
            const { idleGame } = getCrabadaContracts(hre)

            hre.ethers.provider.on('latest', (tx: ethers.Transaction) =>{
                if (tx.to === idleGame.address &&
                    tx.data.slice(0,10) == START_GAME_ENCODED_OPERATION){

                    const teamId = BigNumber.from(`0x${tx.data.slice(-64)}`)
                    console.log(+new Date()/1000, 'Pending transaction', tx.hash, (tx as any).blockNumber, teamId.toNumber());

                }
            })

            idleGame.on( idleGame.filters.StartGame(), async (gameId: BigNumber, teamId: BigNumber, duration: BigNumber, craReward: BigNumber, tusReward: BigNumber, { transactionHash, blockNumber, getBlock }) => {
                const eventReceivedTimestamp = (+new Date())/1000
                const { timestamp: blockTimestamp } = await getBlock()
                const now = (+new Date())/1000
                console.log(+new Date()/1000, 'StartGame event received.', eventReceivedTimestamp-blockTimestamp, now-blockTimestamp, teamId.toNumber())
            })        


            const filter = {
                fromBlock: 'latest',
                toBlock: 'latest',
                address: idleGame.address,
                topics: [ START_GAME_EVENT_TOPIC ]
            };
            
            const provider = hre.ethers.provider
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
                }, 100)
    
            }))
    
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

        const teamsThatPlayToLooseByTeamId = await getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow)

        await updateTeamsThatWereChaged(hre, teamsThatPlayToLooseByTeamId, blockstoanalyze)

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
                const { attackTeamId } = e.args
                return looterTeams.includes(attackTeamId.toNumber())
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
    .addOptionalParam("teams", "Teams to be considered in the analysis.", "3286,3759,5032,5355,5357,6152,7449,8157,9236" , types.string)
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

const listenPendingStartGameTransaction = async (hre: HardhatRuntimeEnvironment, pendingTransactionsTask: PendingTransactionsTask): Promise<NodeJS.Timer> => {

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
        
    }, 10)

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

        let win = 0
        let loose = 0

        await Promise.all(startGameEvents.map(async(e) =>{

            const { gameId, teamId } = e.args

            const gameBattleInfoPromise = idleGame.getGameBattleInfo(gameId)

            const { battlePoint } = await idleGame.getTeamInfo(teamId)

            if (battlePoint != battlepoints)
                return
            
            const { attackTeamId } = await gameBattleInfoPromise

            if ((attackTeamId as BigNumber).isZero())
                win++
            else{
                const { battlePoint: attackBattlePoint } = await idleGame.getTeamInfo(attackTeamId)

                if (battlePoint >= attackBattlePoint)
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

task(
    "approveoperation",
    "Approve account that will transfer the rewards.",
    async ({ operationaddress }, hre: HardhatRuntimeEnvironment) => {
        
        const { tusToken, craToken } = getCrabadaContracts(hre)

        const signers = await hre.ethers.getSigners()

        const override = await getOverride(hre)

        for (const signer of signers){

            for (const erc20 of [tusToken, craToken]){

                const allowance: BigNumber = await erc20.allowance(signer.address, operationaddress)

                if (allowance.lt(hre.ethers.constants.MaxUint256.div(2))){

                    await erc20.connect(signer).callStatic.approve(operationaddress, hre.ethers.constants.MaxUint256, override)
                    await erc20.connect(signer).approve(operationaddress, hre.ethers.constants.MaxUint256, override)

                }

            }

        }

    })
    .addOptionalParam("operationaddress", "Operation account address.", "0xf597AC540730B2c99A31aE1e1362867C4675de2C", types.string)

task(
    "withdrawrewards",
    "Withdraw rewards to deposit.",
    async ({ rewardsfrom, rewardsto }, hre: HardhatRuntimeEnvironment) => {
        
        const { tusToken, craToken } = getCrabadaContracts(hre)

        const signer = (await hre.ethers.getSigners())[0]

        const override = await getOverride(hre)

        const fromAddresses = rewardsfrom.split(',')

        for (const from of fromAddresses){

            for (const erc20 of [tusToken, craToken]){

                    let value: BigNumber = await erc20.balanceOf(from)

                    if (erc20.address === tusToken.address)
                        value = value.sub(parseEther('240')) // Backup value for reinforcements

                    if (value.gt(0)){
                        console.log('erc20.transferFrom(from, rewardsto, value)', from, rewardsto, formatEther(value));
                        
                        await erc20.connect(signer).callStatic.transferFrom(from, rewardsto, value, override)
                        await erc20.connect(signer).transferFrom(from, rewardsto, value, override)
                    }

            }

        }

    })
    .addParam("rewardsfrom", "Accounts that recieves the rewards (',': coma separeted).", 
        [
            "0xB2f4C513164cD12a1e121Dc4141920B805d024B8",
            "0xE90A22064F415896F1F72e041874Da419390CC6D",
            "0xc7C966754DBE52a29DFD1CCcCBfD2ffBe06B23b2"
        ].join(','), types.string)
    .addParam("rewardsto", "Deposit address.", "0x1A6ED72C435fe1c34491BB3d4e99f888fA2a6152", types.string)

