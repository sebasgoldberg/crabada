// SPDX-License-Identifier: NONE

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";


abstract contract MultiOwnable is Context{

    mapping(address => bool) public isOwner;

    event OwnerAdded(address indexed newOwner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor() {
        _addOwner(_msgSender());
    }

    modifier onlyOwner() {
        require(isOwner[_msgSender()], "MultiOwnable: NOT OWNER");
        _;
    }

    function _addOwner(address newOwner) internal{
        isOwner[newOwner] = true;
    }

    function addOwner(address newOwner) public onlyOwner{
        require(!isOwner[newOwner], 'MultiOwnable: ALREADY OWNER');
        _addOwner(newOwner);
    }

    function removeOwner(address owner) public virtual onlyOwner {
        isOwner[owner] = false;
    }

}
