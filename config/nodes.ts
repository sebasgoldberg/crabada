
export interface AccountConfig{
    accountIndex: number,
    teams: number[]
}

export interface NodeConfig {
    accountsConfigs: AccountConfig[]
}

export interface ConfigByNodeId {
    [nodeId: number]: NodeConfig
}

const main: AccountConfig = {
    accountIndex: 0,
    teams: [3286, 3759, 5032]
}

const looter1: AccountConfig = {
    accountIndex: 1,
    teams: [/*5355,*/ 5357, 6152]
}

const looter2: AccountConfig = {
    accountIndex: 2,
    teams: [7449, 8157]
}


export const CONFIG_BY_NODE_ID: ConfigByNodeId = {
    1: { accountsConfigs: [ main ] },
    2: { accountsConfigs: [  ] },
    4: { accountsConfigs: [ looter2 ]},
    5: { accountsConfigs: [  ] },
    9: { accountsConfigs: [ looter1 ] },
    11: { accountsConfigs: [  ]},
}