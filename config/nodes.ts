
export interface AccountConfig{
    accountIndex: number,
    teams: number[],
    player?: string
}

export interface LootConfig {
    attackOnlyTeamsThatPlayToLoose: boolean,
    startGameFilterMode: "latest" | "pending",
}

export interface NodeConfig {
    lootConfig: LootConfig
    accountsConfigs: AccountConfig[]
}

export interface ConfigByNodeId {
    [nodeId: number]: NodeConfig
}

export const main: AccountConfig = {
    accountIndex: 0,
    teams: [/*3286, 3759, 5032*/]
}

export const looter1: AccountConfig = {
    accountIndex: 1,
    teams: [5355, 5357, 6152]
}

export const looter2: AccountConfig = {
    accountIndex: 2,
    teams: [7449, 8157, 9236]
}

export const player1: AccountConfig = {
    accountIndex: 0,
    teams: [ 10471, /*10472,*/ 10515 ],
    player: '0xb972ADCAc416Fe6e6a3330c5c374b97046013796'
}

export const player2: AccountConfig = {
    accountIndex: 0,
    teams: [ 10654, 10655, /*10656*/ ],
    player: '0x24A73065af5991278e71fe0058cd602c502ba41e'
}

export const player3: AccountConfig = {
    accountIndex: 0,
    teams: [ /*10658, 10659,*/ 10661 ],
    player: '0x5f99D122e14A6e8de1C191f9B6F6D1c4639ad21D'
}

export const player4: AccountConfig = {
    accountIndex: 0,
    teams: [ 11472, 11727 ],
    player: '0x01b6E5fD1C95bfB61b50013f3D3454B3CAf8742B'
}

const LOOT_CONFIG_FOR_REINFORCE: LootConfig = {
    attackOnlyTeamsThatPlayToLoose: false,
    startGameFilterMode: "latest",
}

const LOOT_CONFIG_FOR_VALIDATOR: LootConfig = {
    attackOnlyTeamsThatPlayToLoose: true,
    startGameFilterMode: "latest"
}

export const CONFIG_BY_NODE_ID: ConfigByNodeId = {
    1: { lootConfig: LOOT_CONFIG_FOR_REINFORCE, accountsConfigs: [ main ] },
    2: { lootConfig: LOOT_CONFIG_FOR_REINFORCE, accountsConfigs: [ looter2 ] },
    4: { lootConfig: LOOT_CONFIG_FOR_REINFORCE, accountsConfigs: [ main ]},
    5: { lootConfig: LOOT_CONFIG_FOR_REINFORCE, accountsConfigs: [ looter2 ] },
    9: { lootConfig: LOOT_CONFIG_FOR_REINFORCE, accountsConfigs: [ /*main,*/ looter1, looter2 ] },
    11: { lootConfig: LOOT_CONFIG_FOR_REINFORCE, accountsConfigs: [ main ]},
}