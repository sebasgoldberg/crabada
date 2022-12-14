import { task } from "hardhat/config";

import { formatEther, parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { attachAttackRouter, attachPlayer, deployAttackRouter, deployPlayer, getCrabadaContracts, waitTransaction } from "../scripts/crabada";
import { types } from "hardhat/config"
import { evm_increaseTime, logTransactionAndWait, transferCrabadasFromTeam } from "../test/utils";
import { BigNumber, Contract, ethers } from "ethers";
import { getSigner, LOOT_PENDING_CONFIG } from "./crabada";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

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
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

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
    "routerdeploy",
    "Deploy of AttackRouter contract.",
    async ({ testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const router = await deployAttackRouter(hre, signer)
        console.log(`AttackRouter created: ${router.address}`);
        console.log(router.deployTransaction.hash);

        await router.deployed()
    
    })
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "playersetapproval",
    "Signer sets approval to manage all Crabada NFTs to Player contract.",
    async ({ player, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const { crabada } = getCrabadaContracts(hre)

        const isApprovedForAll = await crabada.connect(signer).isApprovedForAll(signer.address, player)
        if (!isApprovedForAll){
            console.log('crabada.callStatic.setApprovalForAll(_playerTo.address, true)', player);
            await crabada.connect(signer).callStatic.setApprovalForAll(player, true, hre.crabada.network.getOverride())
            console.log('crabada.setApprovalForAll(_playerTo.address, true)', player);
            await waitTransaction(await crabada.connect(signer).setApprovalForAll(player, true, hre.crabada.network.getOverride()), 2)
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

        await playerC.connect(signer).callStatic.deposit(signer.address, crabadasToDesposit, hre.crabada.network.getOverride())
        
        await playerC.connect(signer).deposit(signer.address, crabadasToDesposit, hre.crabada.network.getOverride())
        
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

        await playerC.connect(signer).callStatic.createTeam(c1, c2, c3, hre.crabada.network.getOverride())

        await playerC.connect(signer).createTeam(c1, c2, c3, hre.crabada.network.getOverride())

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
            const { crabadaId1: c1, crabadaId2: c2, crabadaId3: c3, battlePoint } = teamInfo
            console.log(`${teamId.toString()}: ${[c1, c2, c3].map( (x:BigNumber) => x.toNumber() )} | bp: ${ battlePoint }`);
        }
    })
    .addParam("player", "Player contract address, for which will be created the team.")

export const PLAYER_TUS_RESERVE = parseEther('120') 

export const playerWithdrawErc20 = async (
    hre: HardhatRuntimeEnvironment, signer: SignerWithAddress, 
    playerAddresses: string[], log=console.log ) => {
    const pContracts: Contract[] = await Promise.all(
        playerAddresses.map( pAddress => attachPlayer(hre, pAddress))
    )

    const override = hre.crabada.network.getOverride()

    for (const p of pContracts){

        const { tusToken, craToken } = getCrabadaContracts(hre)

        for (const erc20 of [tusToken, craToken]){

            let value: BigNumber = await erc20.balanceOf(p.address)

            if (erc20.address === tusToken.address)
                value = value.sub(PLAYER_TUS_RESERVE) // Backup value for reinforcements

            if (value.gt(0)){
                log('player.withdrawERC20(erc20.address, signer.address, value)', erc20.address, signer.address, formatEther(value));
                
                await p.connect(signer).callStatic.withdrawERC20(erc20.address, signer.address, value, override)
                await logTransactionAndWait(p.connect(signer).withdrawERC20(erc20.address, signer.address, value, override), 1, log)

            }

        }

    }

}

task(
    "playerwithdrawerc20",
    "Withdraw TUS and CRA from players.",
    async ({ players, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const playerAddresses: string[] = 
            players ? (players as string).split(',') : LOOT_PENDING_CONFIG.players.map(p=>p.address)

        await playerWithdrawErc20(hre, signer, playerAddresses)

    })
    .addOptionalParam("players", "Player contracts addresses (coma separated).", undefined, types.string)
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

        await idleGame.connect(signer).callStatic.closeGame(gameId, hre.crabada.network.getOverride())
        
        await idleGame.connect(signer).closeGame(gameId, hre.crabada.network.getOverride())

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

        await playerC.connect(signer).callStatic.removeCrabadaFromTeam(teamid, position, hre.crabada.network.getOverride())
        
        await playerC.connect(signer).removeCrabadaFromTeam(teamid, position, hre.crabada.network.getOverride())
        
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

        await _player.connect(signer).callStatic.addCrabadaToTeam(teamid, position, crabada, hre.crabada.network.getOverride())
        
        await _player.connect(signer).addCrabadaToTeam(teamid, position, crabada, hre.crabada.network.getOverride())
        
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

        await playerC.connect(signer).callStatic.withdraw(signer.address, crabadasIds, hre.crabada.network.getOverride())
        
        await playerC.connect(signer).withdraw(signer.address, crabadasIds, hre.crabada.network.getOverride())
        
    })
    .addParam("player", "Player contract address, for which will be created the team.")
    .addParam("crabadas", "Crabadas to be withdraw.")
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "playertransferownership",
    "Transfer ownership.",
    async ({ player, newowner, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const playerC = await attachPlayer(hre, player)

        await playerC.connect(signer).callStatic.transferOwnership(newowner)

        await playerC.connect(signer).transferOwnership(newowner, hre.crabada.network.getOverride())

    })
    .addParam("player", "Player contract address that will be transfered.")
    .addParam("newowner", "New owner of the player contract.")
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

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
                await _playerFrom.callStatic.removeCrabadaFromTeam(teamId, position, hre.crabada.network.getOverride())
                console.log('_playerFrom.removeCrabadaFromTeam(teamId, position)', teamId.toNumber(), position);
                await waitTransaction(await _playerFrom.removeCrabadaFromTeam(teamId, position, hre.crabada.network.getOverride()), wait)
            }
    
            const crabadasIds = [c1, c2, c3]

            console.log('_playerFrom.callStatic.withdraw(_playerTo.address, crabadasIds)', signer.address, crabadasIds.map(x=>x.toString()));
            await _playerFrom.callStatic.withdraw(signer.address, crabadasIds, hre.crabada.network.getOverride())
            console.log('_playerFrom.withdraw(_playerTo.address, crabadasIds)', signer.address, crabadasIds.map(x=>x.toString()));
            await waitTransaction(await _playerFrom.withdraw(signer.address, crabadasIds, hre.crabada.network.getOverride()), wait)

            const isApprovedForAll = await crabada.isApprovedForAll(signer.address, _playerTo.address)
            if (!isApprovedForAll){
                console.log('crabada.callStatic.setApprovalForAll(_playerTo.address, true)', _playerTo.address);
                await crabada.connect(signer).callStatic.setApprovalForAll(_playerTo.address, true, hre.crabada.network.getOverride())
                console.log('crabada.setApprovalForAll(_playerTo.address, true)', _playerTo.address);
                await waitTransaction(await crabada.connect(signer).setApprovalForAll(_playerTo.address, true, hre.crabada.network.getOverride()), wait)
            }

            console.log('_playerTo.callStatic.deposit(_playerTo.address, crabadasIds)', signer.address, crabadasIds.map(x=>x.toString()));
            await _playerTo.callStatic.deposit(signer.address, crabadasIds, hre.crabada.network.getOverride())
            console.log('_playerTo.deposit(_playerTo.address, crabadasIds)', signer.address, crabadasIds.map(x=>x.toString()));
            await waitTransaction(await _playerTo.deposit(signer.address, crabadasIds, hre.crabada.network.getOverride()), wait)

            console.log('_playerTo.callStatic.createTeam(c1, c2, c3)', ...(crabadasIds.map(x=>x.toString())) );
            await _playerTo.callStatic.createTeam(c1, c2, c3, hre.crabada.network.getOverride())
            console.log('_playerTo.createTeam(c1, c2, c3)', ...(crabadasIds.map(x=>x.toString())) );
            await waitTransaction(await _playerTo.createTeam(c1, c2, c3, hre.crabada.network.getOverride()), wait)
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

        const override = hre.crabada.network.getOverride()

        await playerC.connect(signer).callStatic.addOwner(newowner, override)

        const txr: ethers.providers.TransactionResponse = await playerC.connect(signer).addOwner(newowner, hre.crabada.network.getOverride())
        
        console.log(txr.hash);

    })
    .addParam("player", "Player contract for which will be added a new owner.")
    .addParam("newowner", "New owner of the player contract.")
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)


task(
    "routeraddowner",
    "Add a new owner for AttackRouter.",
    async ({ router, newowner, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        const signer = await getSigner(hre, testaccount)

        const routerC = await attachAttackRouter(hre, router)

        await routerC.connect(signer).callStatic.addOwner(newowner)

        await routerC.connect(signer).addOwner(newowner, hre.crabada.network.getOverride())

    })
    .addParam("router", "AttackRouter contract for which will be added a new owner.")
    .addParam("newowner", "New owner of the AttackRouter contract.")
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)


    const MIN_BATTLE_POINTS = 564
    const MAX_BATTLE_POINTS = 712
    const STEP_BATTLE_POINTS = (MAX_BATTLE_POINTS-MIN_BATTLE_POINTS)/10

