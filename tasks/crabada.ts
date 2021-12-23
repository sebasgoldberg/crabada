import { task } from "hardhat/config";

import { formatEther, formatUnits } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { attachPlayer, baseFee, deployPlayer, gasPrice, getCrabadaContracts, getOverride, mineStep } from "../scripts/crabada";
import { types } from "hardhat/config"
import { evm_increaseTime, transferCrabadasFromTeam } from "../test/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";

task("basefee", "Get the base fee", async (args, hre): Promise<void> => {
    console.log(formatUnits(await baseFee(hre), 9))
})
  
task("gasprice", "Get the base fee", async (args, hre): Promise<void> => {
    console.log(formatUnits(await gasPrice(hre), 9))
})

const getSigner = async (hre: HardhatRuntimeEnvironment, testaccount: string, signerIndex: number = 0): Promise<SignerWithAddress> => {
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
    async ({ minerteamid, attackercontract, attackerteamid, wait, testmineraccount, testattackeraccount }, hre: HardhatRuntimeEnvironment) => {
        
        const minerSigner = await getSigner(hre, testmineraccount, 0)
        const attackerSigner = await getSigner(hre, testattackeraccount, 1)

        try {
            await mineStep(hre, minerteamid, attackercontract, attackerteamid, wait, minerSigner, attackerSigner)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
        }

    })
    .addParam("minerteamid", "The team ID to use for mining.")
    .addParam("attackercontract", "The attacker contract address.")
    .addParam("attackerteamid", "The team ID to use for attack.")
    .addOptionalParam("wait", "Number of confirmation before continue execution.", 10, types.int)
    .addOptionalParam("testmineraccount", "Mining account used for testing", undefined, types.string)
    .addOptionalParam("testattackeraccount", "Mining account used for testing", undefined, types.string)

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

        await crabada.connect(signer).setApprovalForAll(player, true, await getOverride(hre))
        
    })
    .addParam("player", "Player contract address, for which will be created the team.")
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "playerdeposit",
    "Deposit of crabadas in the game.",
    async ({ player, c1, c2, c3, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const playerC = await attachPlayer(hre, player)

        await playerC.connect(signer).callStatic.deposit(signer.address, [c1, c2, c3], await getOverride(hre))
        
        await playerC.connect(signer).deposit(signer.address, [c1, c2, c3], await getOverride(hre))
        
    })
    .addParam("player", "Player contract address, for which will be created the team.")
    .addParam("c1", "Crabada ID 1.", undefined, types.int)
    .addParam("c2", "Crabada ID 2.", undefined, types.int)
    .addParam("c3", "Crabada ID 3.", undefined, types.int)
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
    async ({ player, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const { tusToken, craToken } = getCrabadaContracts(hre)

        const playerC = await attachPlayer(hre, player)

        console.log('SIGNER: TUS, CRA', formatEther(await tusToken.balanceOf(signer.address)), formatEther(await craToken.balanceOf(signer.address)));
        console.log('PLAYER: TUS, CRA', formatEther(await tusToken.balanceOf(playerC.address)), formatEther(await craToken.balanceOf(playerC.address)));
        
        await playerC.connect(signer).withdrawERC20(tusToken.address, signer.address, await tusToken.balanceOf(playerC.address), await getOverride(hre))
        await playerC.connect(signer).withdrawERC20(craToken.address, signer.address, await craToken.balanceOf(playerC.address), await getOverride(hre))

        console.log('SIGNER: TUS, CRA', formatEther(await tusToken.balanceOf(signer.address)), formatEther(await craToken.balanceOf(signer.address)));

    })
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
    "playerwithdraw",
    "Remove of crabadas from team.",
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
