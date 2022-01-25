import { task } from "hardhat/config";

import { formatEther, formatUnits, parseEther, parseUnits } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { attachPlayer, baseFee, CloseDistanceToStartByTeamId, closeGameToStartGameDistances, compareBigNumbersDescending, deployPlayer, fightDistanceDistribution, gasPrice, getCloseDistanceToStartByTeamId, getCrabadaContracts, getOverride, getPercentualStepDistribution, getPossibleTargetsByTeamId, getTeamsThatPlayToLooseByTeamId, isTeamLocked, locked, loot, MAX_FEE, mineStep, MIN_VALID_BATTLE_POINTS, ONE_GWEI, queryFilterByPage, settleGame, StepMaxValuesByPercentage, TeamInfoByTeam, updateTeamsThatWereChaged, waitTransaction } from "../scripts/crabada";
import { types } from "hardhat/config"
import { evm_increaseTime, transferCrabadasFromTeam } from "../test/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract, ethers } from "ethers";
import { format } from "path/posix";
import { CONFIG_BY_NODE_ID, LootersTeamsByAccountIndex } from "../config/nodes";

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
    "setupplayertest",
    "Mine step: If mining, try to close game. Then, if not mining, create a game.",
    async ({ teamid, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        await evm_increaseTime(hre, 4*60*60)

        let signer = undefined

        await hre.ethers.provider.send('hardhat_impersonateAccount', [testaccount] );
        signer = await hre.ethers.provider.getSigner(testaccount)
        if(!signer.address)
            signer.address = signer._address

        const { idleGame, crabada } = getCrabadaContracts(hre)

        const crabadaTeamMembers = await transferCrabadasFromTeam(hre, teamid, signer.address, idleGame, crabada)

        console.log(crabadaTeamMembers.map(x => x.toNumber()));
        
        // const player = await deployPlayer(hre, signer)
        // console.log(`Player created: ${player.address}`);

        // await crabada.connect(signer).setApprovalForAll(player.address, true)
        // await player.connect(signer).deposit(signer.address, crabadaTeamMembers)
        // await player.connect(signer).createTeam(...crabadaTeamMembers)
        // const teamId = await player.teams(0)
        // console.log(`Player's team created: ${teamId}`);

    })
    .addOptionalParam("teamid", "The team ID to use to setup player for testing.", 3156, types.int)
    .addOptionalParam("testaccount", "Account used for testing", '0xB2f4C513164cD12a1e121Dc4141920B805d024B8', types.string)

task(
    "playerdeploy",
    "Deploy of player contract.",
    async ({ testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const player = await deployPlayer(hre, signer)
        console.log(`Player created: ${player.address}`);
        console.log(player.deployTransaction.hash);

        await player.deployed()
    
    })
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "playersetapproval",
    "Team creation for player.",
    async ({ player, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const { crabada } = getCrabadaContracts(hre)

        const isApprovedForAll = await crabada.isApprovedForAll(signer.address, player)
        if (!isApprovedForAll){
            console.log('crabada.callStatic.setApprovalForAll(_playerTo.address, true)', player);
            await crabada.connect(signer).callStatic.setApprovalForAll(player, true, await getOverride(hre))
            console.log('crabada.setApprovalForAll(_playerTo.address, true)', player);
            await waitTransaction(await crabada.connect(signer).setApprovalForAll(player, true, await getOverride(hre)), 2)
        }else
            console.log('Already approved')

    })
    .addParam("player", "Player contract address, for which will be created the team.")
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "playerdeposit",
    "Deposit of crabadas in the game.",
    async ({ player, crabadas, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const playerC = await attachPlayer(hre, player)

        const crabadasToDesposit = crabadas.split(',').map( s => BigNumber.from(s))

        await playerC.connect(signer).callStatic.deposit(signer.address, crabadasToDesposit, await getOverride(hre))
        
        await playerC.connect(signer).deposit(signer.address, crabadasToDesposit, await getOverride(hre))
        
    })
    .addParam("player", "Player contract address, for which will be created the team.")
    .addParam("crabadas", "Crabada to deposit separated by ','.", '', types.string)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "playercreateteam",
    "Team creation for player.",
    async ({ player, c1, c2, c3, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const playerC = await attachPlayer(hre, player)

        await playerC.connect(signer).callStatic.createTeam(c1, c2, c3, await getOverride(hre))

        await playerC.connect(signer).createTeam(c1, c2, c3, await getOverride(hre))

        const teamId = await playerC.teams((await playerC.teamsCount()).sub(1))
        console.log(`Team created: ${teamId}`);
        
    })
    .addParam("player", "Player contract address, for which will be created the team.")
    .addParam("c1", "Crabada ID 1.", undefined, types.int)
    .addParam("c2", "Crabada ID 2.", undefined, types.int)
    .addParam("c3", "Crabada ID 3.", undefined, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "playerlistteams",
    "List player teams.",
    async ({ player }, hre: HardhatRuntimeEnvironment) => {
        
        const playerC = await attachPlayer(hre, player)
        const { idleGame } = getCrabadaContracts(hre)

        const teamsCount = await playerC.teamsCount()
        for (let i=0; i<teamsCount; i++){
            const teamId = await playerC.teams(i)
            const teamInfo = await idleGame.getTeamInfo(teamId)
            const { currentGameId: gameId3, crabadaId1: c1, crabadaId2: c2, crabadaId3: c3 } = teamInfo
            console.log(`${teamId.toString()}: ${[c1, c2, c3].map( (x:BigNumber) => x.toNumber() )}`);
        }
    })
    .addParam("player", "Player contract address, for which will be created the team.")

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
    "playerwithdrawerc20",
    "Mine step: If mining, try to close game. Then, if not mining, create a game.",
    async ({ player, accountindex, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount, accountindex)

        const { tusToken, craToken } = getCrabadaContracts(hre)

        const playerC = await attachPlayer(hre, player)

        console.log('SIGNER: TUS, CRA', formatEther(await tusToken.balanceOf(signer.address)), formatEther(await craToken.balanceOf(signer.address)));
        console.log('PLAYER: TUS, CRA', formatEther(await tusToken.balanceOf(playerC.address)), formatEther(await craToken.balanceOf(playerC.address)));
        
        await playerC.connect(signer).withdrawERC20(tusToken.address, signer.address, await tusToken.balanceOf(playerC.address), await getOverride(hre))
        await playerC.connect(signer).withdrawERC20(craToken.address, signer.address, await craToken.balanceOf(playerC.address), await getOverride(hre))

        console.log('SIGNER: TUS, CRA', formatEther(await tusToken.balanceOf(signer.address)), formatEther(await craToken.balanceOf(signer.address)));

    })
    .addOptionalParam("accountindex", "The index of the account to be used.", undefined, types.int)
    .addOptionalParam("player", "Player contract address.")
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "playerclosegame",
    "Remove of crabadas from team.",
    async ({ player, teamid, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const { idleGame } = getCrabadaContracts(hre)

        const playerC = await attachPlayer(hre, player)

        const teamInfo = await idleGame.getTeamInfo(teamid)
        const { currentGameId: gameId} = teamInfo

        await idleGame.connect(signer).callStatic.closeGame(gameId, await getOverride(hre))
        
        await idleGame.connect(signer).closeGame(gameId, await getOverride(hre))

    })
    .addParam("player", "Player contract address, for which will be created the team.")
    .addParam("teamid", "Team ID from which Crabada has to be removed.", undefined, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

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
    "playerremovefromteam",
    "Remove of crabadas from team.",
    async ({ player, teamid, position, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const playerC = await attachPlayer(hre, player)

        await playerC.connect(signer).callStatic.removeCrabadaFromTeam(teamid, position, await getOverride(hre))
        
        await playerC.connect(signer).removeCrabadaFromTeam(teamid, position, await getOverride(hre))
        
    })
    .addParam("player", "Player contract address, for which will be created the team.")
    .addParam("teamid", "Team ID from which Crabada has to be removed.", undefined, types.int)
    .addParam("position", "Position of Crabada to be removed.", undefined, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "playeraddtoteam",
    "Add crabada to team in the specified position.",
    async ({ player, teamid, position, crabada, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const _player = await attachPlayer(hre, player)

        await _player.connect(signer).callStatic.addCrabadaToTeam(teamid, position, crabada, await getOverride(hre))
        
        await _player.connect(signer).addCrabadaToTeam(teamid, position, crabada, await getOverride(hre))
        
    })
    .addParam("player", "Player contract address, for which will be created the team.")
    .addParam("teamid", "Team ID from which Crabada has to be removed.", undefined, types.int)
    .addParam("position", "Position of Crabada to be removed.", undefined, types.int)
    .addParam("crabada", "Position of Crabada to be removed.", undefined, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "playerwithdraw",
    "Remove crabadas from game and transfer to signer.",
    async ({ player, crabadas, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const playerC = await attachPlayer(hre, player)

        const crabadasIds = (crabadas as string).split(',').map( x => BigNumber.from(x) )

        await playerC.connect(signer).callStatic.withdraw(signer.address, crabadasIds, await getOverride(hre))
        
        await playerC.connect(signer).withdraw(signer.address, crabadasIds, await getOverride(hre))
        
    })
    .addParam("player", "Player contract address, for which will be created the team.")
    .addParam("crabadas", "Crabadas to be withdraw.")
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
    "playertransferownership",
    "Transfer ownership.",
    async ({ player, newowner, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const playerC = await attachPlayer(hre, player)

        await playerC.connect(signer).callStatic.transferOwnership(newowner)

        await playerC.connect(signer).transferOwnership(newowner, await getOverride(hre))

    })
    .addParam("player", "Player contract address that will be transfered.")
    .addParam("newowner", "New owner of the player contract.")
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

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


task(
    "playermigrateteam",
    "Migrate teams from one player to another",
    async ({ playerfrom, playerto, accountindex, wait, testaccount }, hre: HardhatRuntimeEnvironment) => {

        const signer = await getSigner(hre, testaccount, accountindex)
        
        const { idleGame, crabada } = getCrabadaContracts(hre)

        const _playerFrom = (await attachPlayer(hre, playerfrom)).connect(signer)

        const _playerTo = (await attachPlayer(hre, playerto)).connect(signer)

        const teamsCount: number = (await _playerFrom.teamsCount()).toNumber()

        for (let i=0; i<teamsCount; i++){

            const teamId = await _playerFrom.teams(i)
            const teamInfo = await idleGame.getTeamInfo(teamId)
            const { crabadaId1: c1, crabadaId2: c2, crabadaId3: c3 } = teamInfo

            for (let position=0; position<3; position++){
                console.log('_playerFrom.callStatic.removeCrabadaFromTeam(teamId, position)', teamId.toNumber(), position);
                await _playerFrom.callStatic.removeCrabadaFromTeam(teamId, position, await getOverride(hre))
                console.log('_playerFrom.removeCrabadaFromTeam(teamId, position)', teamId.toNumber(), position);
                await waitTransaction(await _playerFrom.removeCrabadaFromTeam(teamId, position, await getOverride(hre)), wait)
            }
    
            const crabadasIds = [c1, c2, c3]

            console.log('_playerFrom.callStatic.withdraw(_playerTo.address, crabadasIds)', signer.address, crabadasIds.map(x=>x.toString()));
            await _playerFrom.callStatic.withdraw(signer.address, crabadasIds, await getOverride(hre))
            console.log('_playerFrom.withdraw(_playerTo.address, crabadasIds)', signer.address, crabadasIds.map(x=>x.toString()));
            await waitTransaction(await _playerFrom.withdraw(signer.address, crabadasIds, await getOverride(hre)), wait)

            const isApprovedForAll = await crabada.isApprovedForAll(signer.address, _playerTo.address)
            if (!isApprovedForAll){
                console.log('crabada.callStatic.setApprovalForAll(_playerTo.address, true)', _playerTo.address);
                await crabada.connect(signer).callStatic.setApprovalForAll(_playerTo.address, true, await getOverride(hre))
                console.log('crabada.setApprovalForAll(_playerTo.address, true)', _playerTo.address);
                await waitTransaction(await crabada.connect(signer).setApprovalForAll(_playerTo.address, true, await getOverride(hre)), wait)
            }

            console.log('_playerTo.callStatic.deposit(_playerTo.address, crabadasIds)', signer.address, crabadasIds.map(x=>x.toString()));
            await _playerTo.callStatic.deposit(signer.address, crabadasIds, await getOverride(hre))
            console.log('_playerTo.deposit(_playerTo.address, crabadasIds)', signer.address, crabadasIds.map(x=>x.toString()));
            await waitTransaction(await _playerTo.deposit(signer.address, crabadasIds, await getOverride(hre)), wait)

            console.log('_playerTo.callStatic.createTeam(c1, c2, c3)', ...(crabadasIds.map(x=>x.toString())) );
            await _playerTo.callStatic.createTeam(c1, c2, c3, await getOverride(hre))
            console.log('_playerTo.createTeam(c1, c2, c3)', ...(crabadasIds.map(x=>x.toString())) );
            await waitTransaction(await _playerTo.createTeam(c1, c2, c3, await getOverride(hre)), wait)
        }


    })
    .addParam("playerfrom", "The contract that has teams of crabada.")
    .addParam("playerto", "The contract that does not has teams of crabada.")
    .addParam("accountindex", "The index of the account to be used.", undefined, types.int)
    .addOptionalParam("wait", "Number of wait per transaction.", 3, types.int)
    .addOptionalParam("testaccount", "Account used for testing.", undefined, types.string)
    

task(
    "playeraddowner",
    "Add a new owner for player.",
    async ({ player, newowner, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const playerC = await attachPlayer(hre, player)

        await playerC.connect(signer).callStatic.addOwner(newowner)

        await playerC.connect(signer).addOwner(newowner, await getOverride(hre))

    })
    .addParam("player", "Player contract for which will be added a new owner.")
    .addParam("newowner", "New owner of the player contract.")
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)


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
    async ({ blockstoanalyze, firstdefendwindow, lootersteamsbyaccount, testaccount, testmode }, hre: HardhatRuntimeEnvironment) => {

        if (!(hre.config.nodeId in CONFIG_BY_NODE_ID))
            return

        const lootersTeamsByAccountIndex: LootersTeamsByAccountIndex = lootersteamsbyaccount ? 
            JSON.parse(lootersteamsbyaccount) : CONFIG_BY_NODE_ID[hre.config.nodeId]

        const { idleGame } = getCrabadaContracts(hre)

        const lootersTeams = lootersTeamsByAccountIndex.flat()

        if (lootersTeams.length == 0)
            return

        if ( !testmode && (await areAllTeamsLocked(hre, idleGame, lootersTeams)) )
            return

        const teamsThatPlayToLooseByTeamId = await getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow)

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

            for (let accountIndex=0; accountIndex<lootersTeamsByAccountIndex.length; accountIndex++){

                const signer = await getSigner(hre, testaccount, accountIndex)
    
                console.log('Looting with signer', signer.address);
    
                for (const looterTeamId of lootersTeamsByAccountIndex[accountIndex]){
    
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
    .addOptionalParam("lootersteamsbyaccount", "JSON (array of arrays) with the looters teams ids by account. Example: '[[0,1,2],[4,5],[6]]'.", undefined, types.string)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)
    .addOptionalParam("testmode", "Test mode", true, types.boolean)

interface LootGuessConfig {
    players: {
        address: string,
        teams: number[]
    }[],
    maxBlocksPerTeams: number,
    maxStandardDeviation: number
}

task(
    "lootguess",
    "Loot process based on predict of startGame transactions using the CloseGame events and analyses on teams behaviours.",
    async ({ blockstoanalyze, firstdefendwindow, lootersteamsbyaccount, testaccount, testmode }, hre: HardhatRuntimeEnvironment) => {

        const signer = await getSigner(hre, testaccount)

        const lootGuessConfig: LootGuessConfig = {
            maxBlocksPerTeams: 55,
            maxStandardDeviation: 10,
            players: [
                {
                    address: 'P1',
                    teams: [3286, 3759, 5032]
                },
                {
                    address: 'P2',
                    teams: [5355, 5357, 6152]
                },
                {
                    address: 'P3',
                    teams: [7449]
                },
            ]
        }

        const { idleGame } = getCrabadaContracts(hre)

        // Verify there are teams in the config.

        const lootersTeams = lootGuessConfig.players.map( p => p.teams ).flat()

        if (lootersTeams.length == 0)
            return

        // Initialize Player/Team data structure

        interface PlayerTeamPair {
            playerAddress: string,
            teamId: number,
            locked: boolean,
            battlePoint: number,
        }

        // TODO Verify that works
        const playerTeamPairs: PlayerTeamPair[] = await Promise.all(lootGuessConfig.players
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
        
        // await Promise.all(playerTeamPairs.map( async(pair) => {
        //     const { battlePoint } = await idleGame.getTeamInfo(pair.teamId)
        //     pair.battlePoint = battlePoint
        // }))
        
        // Initialize teams' lock status

        const updateLockStatus = async (hre: HardhatRuntimeEnvironment, idleGame: Contract, playerTeamPairs: PlayerTeamPair[]) => {
            return (await Promise.all(
                playerTeamPairs.map( async(playerTeamPair): Promise<any> => {
                    playerTeamPair.locked = !testmode || await isTeamLocked(hre, idleGame, playerTeamPair.teamId, ()=>{})
                }) 
            ))
        }

        await updateLockStatus(hre, idleGame, playerTeamPairs)

        // Sets interval to settleGame for unlocked teams.
        
        const settleGameInterval = !testmode && setInterval(async()=>{

            playerTeamPairs
                .filter(p=>!p.locked)
                .forEach(async(p)=>{
                    const { currentGameId } = await idleGame.getTeamInfo(BigNumber.from(p.teamId))
                    settleGame(idleGame.connect(signer), currentGameId, 1, ()=>{})
                })

        }, 2000)


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

        // Get teams with their minCloseDistanceToStart, averageCloseDistanceToStart and
        // deviationCloseDistanceToStart
        const closeDistanceToStartByTeamId: CloseDistanceToStartByTeamId = await getCloseDistanceToStartByTeamId(hre, blockstoanalyze, teamsThatPlayToLooseByTeamId)

        const stepsDistributionForDistanceDeviation: StepMaxValuesByPercentage = getPercentualStepDistribution(
            Object.keys(closeDistanceToStartByTeamId)
                .map(teamId => closeDistanceToStartByTeamId[teamId].standardDeviationBlocks)
                .sort((a,b) => a<b?-1:a>b?1:0),
            20)
        console.log('stepsDistributionForDistanceDeviation', stepsDistributionForDistanceDeviation);

        // Set interval for updating teams' lock status.

        const updateLockStatusInterval = setInterval(() => updateLockStatus(hre, idleGame, playerTeamPairs), 2000);

        // Listen for CloseGame events to register team for looting

        interface ClosedGameTargets {
            teamId: BigNumber,
            closeGameBlocknumber: number,
        }

        interface ClosedGameTargetsByTeamId {
            [teamId:string]: ClosedGameTargets
        }

        const closedGameTargetsByTeamId: ClosedGameTargetsByTeamId = {}

        const addTeamToLootTargets = async (gameId: BigNumber, { transactionHash, blockNumber, getBlock }) => {

            const { teamId } = await idleGame.getGameBasicInfo(gameId)

            if (!teamsThatPlayToLooseByTeamId[teamId.toString()])
                return

            const targetTeamInfo = teamsThatPlayToLooseByTeamId[teamId.toString()]

            if (!targetTeamInfo.battlePoint)
                return

            const pairsStrongerThanTarget = playerTeamPairs.filter( p => p.battlePoint > targetTeamInfo.battlePoint)

            if (pairsStrongerThanTarget.length == 0)
                return

            const closeDistanceToStart = closeDistanceToStartByTeamId[teamId]

            if (!closeDistanceToStart){
                return
            }

            if (closeDistanceToStart.standardDeviationBlocks>lootGuessConfig.maxStandardDeviation){
                console.log('CloseGame:', transactionHash, 
                    'Discarded:', 'Deviation', 
                    closeDistanceToStart.standardDeviationBlocks, '>', lootGuessConfig.maxStandardDeviation,
                )
                return
            }

            closedGameTargetsByTeamId[teamId.toString()] = {
                teamId,
                closeGameBlocknumber: blockNumber,
            }

            console.log('CloseGame', transactionHash, 
                'Added team to loot targets (teamId, blockNumber, gameId)', 
                teamId.toNumber(), blockNumber, gameId.toNumber()
            );
            
        }

        idleGame.on(idleGame.filters.CloseGame(), addTeamToLootTargets)

        // Metrics implementation

        interface GameInfo {
            attackTransactions: number,
        }

        interface GameInfoByGameId {
            [teamId: string]: GameInfo
        }

        class Metrics {

            attackTransactions: number = 0
            effectiveGameAttacks: number = 0 // Attack until looted
            failedGameAttacks: number = 0 // Attack but no loot
            gameInfoByGameId: GameInfoByGameId = {}

            attackTeams(teamIds: string[]){
                this.attackTransactions++
                teamIds.forEach( teamId => {
                    if (!this.gameInfoByGameId[teamId]){
                        this.gameInfoByGameId[teamId] = { attackTransactions: 0 }
                    }
                    this.gameInfoByGameId[teamId].attackTransactions++    
                })
            }

            lootTeam(teamId: string){
                if (this.gameInfoByGameId[teamId] && this.gameInfoByGameId[teamId].attackTransactions>0){
                    this.effectiveGameAttacks++
                }
            }

            maxAttacksAchivedForTeam(teamId: string){
                if (this.gameInfoByGameId[teamId] && this.gameInfoByGameId[teamId].attackTransactions>0){
                    this.failedGameAttacks++
                }
            }

            log(){
                console.log('Metrics', {
                    attackTransactions: this.attackTransactions,
                    effectiveGameAttacks: this.effectiveGameAttacks,
                    failedGameAttacks: this.failedGameAttacks,
                });    
            }

        }

        const metrics = new Metrics()


        // Set interval to verify if a possible target should be removed considering
        // the following conditions are met:
        // 1) game is already looted (use getGameBattleInfo and get status)
        // 2) currentBlock-closeGameBlock > maxBlocksPerTarget

        const removeCloseGameTargetsInterval = setInterval(() => {

            Object.keys(closedGameTargetsByTeamId).forEach( async(teamId) => {

                const closedGameTarget = closedGameTargetsByTeamId[teamId]

                const { currentGameId } = await idleGame.getTeamInfo(BigNumber.from(teamId))

                if (!(currentGameId as BigNumber).isZero()){

                    const { attackTeamId } = await idleGame.getGameBattleInfo(currentGameId)

                    // Validate if game is already looted
                    if (!(attackTeamId as BigNumber).isZero()){

                        metrics.lootTeam(teamId)

                        console.log(
                            'Game Looted. Removed team from loot targets (teamId, blockNumber, currentGameId)', 
                            teamId, closedGameTarget.closeGameBlocknumber, currentGameId.toNumber()
                        );
        
                        delete closedGameTargetsByTeamId[teamId]
                        return
                    }

                }

                const closeDistanceToStart = closeDistanceToStartByTeamId[teamId]

                const deviationToUse = Math.min(5, closeDistanceToStart.standardDeviationBlocks)

                if ((hre.ethers.provider.blockNumber-closedGameTarget.closeGameBlocknumber) 
                    > (closeDistanceToStart.averageBlocks+deviationToUse)){

                    metrics.maxAttacksAchivedForTeam(teamId)
                    
                    console.log(
                        'Max block difference from CloseGame achived', 
                        hre.ethers.provider.blockNumber-closedGameTarget.closeGameBlocknumber, '>',
                        closeDistanceToStart.averageBlocks+deviationToUse,
                        'Removed team from loot targets (teamId, blockNumber, gameId)', 
                        teamId, closedGameTarget.closeGameBlocknumber, currentGameId.toNumber()
                    );
    
                    delete closedGameTargetsByTeamId[teamId]
                    return
                }

            })

        }, 3000)

        setInterval( () => {
            metrics.log()
        }, 15000)

        // Main interval to perform attacks considering the following conditions:
        // 1) Apply only for looter teams are unlocked
        // 2) Targets should have battlePoint lower than the maximum looterTeam target battlePoint.
        // 3) For targets currentBlockNumber-closeGameBlockNumber >= minBlocknumberDistance-2
        // 4) Apply only for looter teams that have battlePoint higher than minimum target battlePoint.

        const attackTeamsInterval = setInterval(() => {

            // 1) Apply only for looter teams are unlocked
            const unlockedPlayerTeamPairs = playerTeamPairs.filter( p => !p.locked || testmode )

            if (unlockedPlayerTeamPairs.length == 0){
                console.log('Attack Interval', 'No unlocked looter teams');
                return
            }


            const maxUnlockedLooterBattlePoint = Math.max(
                ...unlockedPlayerTeamPairs
                    .map( playerTeamPair => playerTeamPair.battlePoint )
            )

            const currentBlockNumber = hre.ethers.provider.blockNumber

            const teamIdTargets = Object.keys(closedGameTargetsByTeamId)
                // 2) Targets should have battlePoint lower than the maximum looterTeam target battlePoint.
                .filter(teamId => {
                    if (!teamsThatPlayToLooseByTeamId[teamId]){
                        console.log('Attack Interval', 'Team', Number(teamId), 'does not play to loose.');
                    }

                    if (!teamsThatPlayToLooseByTeamId[teamId].battlePoint){
                        console.log('Attack Interval', 'Team', Number(teamId), 'does not has battlePoint defined.');
                    }
                    
                    if (teamsThatPlayToLooseByTeamId[teamId].battlePoint >= maxUnlockedLooterBattlePoint){
                        console.log('Attack Interval', 'Team', Number(teamId), 'has higher battlePoint', 
                            teamsThatPlayToLooseByTeamId[teamId].battlePoint, 'than', maxUnlockedLooterBattlePoint);
                    }
                    
                    return teamsThatPlayToLooseByTeamId[teamId] &&
                    teamsThatPlayToLooseByTeamId[teamId].battlePoint &&
                    teamsThatPlayToLooseByTeamId[teamId].battlePoint < maxUnlockedLooterBattlePoint
                })

                // 3) For targets currentBlockNumber-closeGameBlockNumber >= average-deviation
                .filter(teamId => {
                    
                    const closeDistanceToStart = closeDistanceToStartByTeamId[teamId]
                    const closedGameTarget = closedGameTargetsByTeamId[teamId]

                    const deviationToUse = Math.min(5, closeDistanceToStart.standardDeviationBlocks)
                    
                    if (((currentBlockNumber-closedGameTarget.closeGameBlocknumber) 
                        < (closeDistanceToStart.averageBlocks-deviationToUse))){
                        console.log('Attack Interval', 'Actual distance', 
                            currentBlockNumber-closedGameTarget.closeGameBlocknumber, 'lower than min distance',
                            closeDistanceToStart.averageBlocks-deviationToUse)
                    }
                    
                    return ((currentBlockNumber-closedGameTarget.closeGameBlocknumber) 
                        >= (closeDistanceToStart.averageBlocks-deviationToUse))
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

            // interface attackOption {
            //     playerAddress: string,
            //     looterTeam: BigNumber,
            //     targetTeam: BigNumber
            // }

            // const attackOption: attackOption[] = unlockedPlayerTeamPairsWithEnoughBattlePointSorted.map( p => {
            //     return teamIdTargets
            //         .filter( teamId => p.battlePoint > teamsThatPlayToLooseByTeamId[teamId].battlePoint )
            //         .map( teamId => {
            //             return ({
            //                 playerAddress: p.playerAddress,
            //                 looterTeam: BigNumber.from(p.teamId),
            //                 targetTeam: BigNumber.from(teamId),
            //             })
            //         })
            // }).flat()

            metrics.attackTeams(teamIdTargets)

            console.log(
                'attackTeams(', 
                'players=', unlockedPlayerTeamPairsWithEnoughBattlePointSorted.map(p=>p.playerAddress).toString(),
                'looterTeams=', unlockedPlayerTeamPairsWithEnoughBattlePointSorted.map(p=>p.teamId).toString(),
                'looterBattlePoint=', unlockedPlayerTeamPairsWithEnoughBattlePointSorted.map(p=>p.battlePoint).toString(),
                'targetTeams=', teamIdTargets.toString(),
                'targetBattlePoint=', teamIdTargets.map(teamId => teamsThatPlayToLooseByTeamId[teamId].battlePoint).toString(),
                ')'
            )

            // TODO player.attackTeams

        }, 2000)

        // Never finish
        await new Promise(() => {})

        clearInterval(attackTeamsInterval)
        idleGame.off(idleGame.filters.AddCrabada(), updateTeamBattlePointListener)
        idleGame.off(idleGame.filters.CloseGame(), addTeamToLootTargets)
        clearInterval(updateLockStatusInterval)
        settleGameInterval && clearInterval(settleGameInterval)
        clearInterval(removeCloseGameTargetsInterval)

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 43200 /*24 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("lootersteamsbyaccount", "JSON (array of arrays) with the looters teams ids by account. Example: '[[0,1,2],[4,5],[6]]'.", undefined, types.string)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)
    .addOptionalParam("testmode", "Test mode", true, types.boolean)

    
export const START_GAME_ENCODED_OPERATION = '0xe5ed1d59'

task(
    "meassurestartgameevents",
    "Listen StartGame events and meassure the time between block and event reception.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {
        
        await (new Promise(async () => {
            const { idleGame } = getCrabadaContracts(hre)

            hre.ethers.provider.on("pending", (tx: ethers.Transaction) =>{
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
                fromBlock: 'pending',
                toBlock: 'pending',
                address: idleGame.address,
                topics: [ '0x0eef6f7452b7d2ee11184579c086fb47626e796a83df2b2e16254df60ab761eb' ]
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
    "pendingtransactions",
    "Listen for pending transactions.",
    async ({ }, hre: HardhatRuntimeEnvironment) => {
        
        const provider = hre.ethers.provider

        const { idleGame } = getCrabadaContracts(hre)

        const filter = {
            fromBlock: 'pending',
            toBlock: 'pending',
            address: idleGame.address,
            topics: [ '0x0eef6f7452b7d2ee11184579c086fb47626e796a83df2b2e16254df60ab761eb' ]
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
            }, 100)

        }))

    })

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
    .addOptionalParam("teams", "Teams to be considered in the analysis.", "3286,3759,5032,5355,5357,6152" , types.string)
    .addOptionalParam("nodesquan", "Nodes quantity", 10, types.int)

// TODO Task to understand costs
/**
 * Loose:
 *   a) Reverted transactions that attack teams already looted in other block.
 *   b) Gas price distance from winner attack and its distribution (requires to attack same team).
 */

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
    .addOptionalParam("teams", "Teams to be considered in the analysis.", "3286,3759,5032,5355,5357,6152" , types.string)
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
