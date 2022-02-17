// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IIddleGame.sol";

contract Settler{

    function settleGame(
        IIddleGame idleGame,
        uint256 gameId,
        address expectedWinner, 
        IERC20 erc20ToCheck,
        uint256 minBalanceIncrease
        )
        public{

        uint256 initialBalance = erc20ToCheck.balanceOf(expectedWinner);

        idleGame.settleGame(gameId);
        
        uint256 finalBalance = erc20ToCheck.balanceOf(expectedWinner);

        require(finalBalance-initialBalance >= minBalanceIncrease, "Settler: LOOSE");

    }

}