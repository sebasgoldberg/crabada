import { formatEther } from "ethers/lib/utils";
import { task } from "hardhat/config";

import { types } from "hardhat/config"
import { HardhatRuntimeEnvironment } from "hardhat/types";

task(
    "inctime",
    "Increase time.",
    async ({ seconds }, hre: HardhatRuntimeEnvironment) => {

        await hre.ethers.provider.send('evm_increaseTime', [seconds]);
        await hre.network.provider.send("evm_mine");
    
    })
    .addOptionalParam("seconds", "Seconds.", 3600, types.int)

task(
    "balance",
    "Increase time.",
    async ({ account }, hre: HardhatRuntimeEnvironment) => {

        console.log(formatEther(await hre.ethers.provider.getBalance(account)))
    
    })
    .addParam("account", "Account address.")

