import { BigNumber, Contract } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

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
