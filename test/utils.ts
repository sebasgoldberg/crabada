import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract, ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getCrabadaContracts, getOverride, settleGame } from "../scripts/crabada";

export const evm_increaseTime = async (hre: HardhatRuntimeEnvironment, seconds: number) => {
    await hre.ethers.provider.send('evm_increaseTime', [seconds]);
    await hre.network.provider.send("evm_mine");
}

export const transferCrabadasFromTeam = async (hre: HardhatRuntimeEnvironment, teamId: number, toAddress: string, idleGame: Contract, crabada: Contract): Promise<BigNumber[]> =>{

    const teamInfo3 = await idleGame.getTeamInfo(teamId)
    const { owner: teamOwnerAddress, currentGameId: gameId3, crabadaId1: c1, crabadaId2: c2, crabadaId3: c3 } = teamInfo3
    await hre.ethers.provider.send('hardhat_impersonateAccount', [teamOwnerAddress] );
    const teamOwner = await hre.ethers.provider.getSigner(teamOwnerAddress)

    try {
      await idleGame.connect(teamOwner).closeGame(gameId3) 
    } catch (error) {
      
    }

    // Remove members from team
    await Promise.all(
      [0, 1, 2].map(
        index => idleGame.connect(teamOwner).removeCrabadaFromTeam(teamId, index)
      )
    );

    // Withdraw crabadas from game
    const crabadaTeamMembers = [c1, c2, c3]
    await idleGame.connect(teamOwner).withdraw(teamOwnerAddress, crabadaTeamMembers)

    // Transfer crabadas to other
    await Promise.all(
      crabadaTeamMembers.map( 
        c => crabada.connect(teamOwner)["safeTransferFrom(address,address,uint256)"](teamOwnerAddress, toAddress, c)
      )
    );

    return crabadaTeamMembers

  }

  export const logTransactionAndWait = async(txrp: Promise<ethers.providers.TransactionResponse>, confirmations: number) => {
    const txr = await txrp
    console.log(txr.nonce, txr.hash);
    await txr.wait(2)
  }

  export const withdrawTeam = async (hre: HardhatRuntimeEnvironment, signer: SignerWithAddress, addressTo: string, teamId: number): Promise<BigNumber[]> =>{

    const { idleGame } = getCrabadaContracts(hre)

    const teamInfo = await idleGame.getTeamInfo(teamId)
    const { owner, currentGameId, crabadaId1: c1, crabadaId2: c2, crabadaId3: c3 } = teamInfo

    if (signer.address != owner){
      throw new Error(`Signer ${ signer.address } does not match owner ${ owner } of team ${ teamId }`);
    }

    await settleGame(idleGame.connect(signer), currentGameId, 3)

    const override = await getOverride(hre)

    // Remove members from team
    for (const index of [0, 1, 2]){
      console.log('removeCrabadaFromTeam(teamId, index)', teamId, index);
      await idleGame.connect(signer).callStatic.removeCrabadaFromTeam(teamId, index, override)
      await logTransactionAndWait(
        idleGame.connect(signer).removeCrabadaFromTeam(teamId, index, override), 2
      )
    }

    // Withdraw crabadas from game
    const crabadaTeamMembers = [c1, c2, c3]
    console.log('withdraw(addressTo, crabadaTeamMembers)', addressTo, crabadaTeamMembers);
    await idleGame.connect(signer).callStatic.withdraw(addressTo, crabadaTeamMembers, override)
    await logTransactionAndWait(
      idleGame.connect(signer).withdraw(addressTo, crabadaTeamMembers, override), 2
    )

    return crabadaTeamMembers

  }
