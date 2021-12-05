import * as hre from "hardhat"

export const evm_increaseTime = async (seconds: number) => {
    await hre.ethers.provider.send('evm_increaseTime', [seconds]);
    await hre.network.provider.send("evm_mine");
}
  