
export interface AccountConfig{
    accountIndex: number,
    teams: number[]
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
    teams: [3286, 3759, 5032]
}

export const looter1: AccountConfig = {
    accountIndex: 1,
    teams: [5355, 5357, 6152]
}

export const looter2: AccountConfig = {
    accountIndex: 2,
    teams: [7449, 8157, 9236]
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
    9: { lootConfig: LOOT_CONFIG_FOR_REINFORCE, accountsConfigs: [ looter1 ] },
    11: { lootConfig: LOOT_CONFIG_FOR_REINFORCE, accountsConfigs: [ main ]},
}