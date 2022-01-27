
interface AccountConfig{
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
    teams: [/*5355,*/ 5357/*, 6152*/]
}

const looter2: AccountConfig = {
    accountIndex: 2,
    teams: [7449, 8157]
}


export const CONFIG_BY_NODE_ID: ConfigByNodeId = {
    1: { accountsConfigs: [looter1] },
    2: { accountsConfigs: [main, looter2, looter1] },
    4: { accountsConfigs: [looter1]},
    5: { accountsConfigs: [main, looter2, ] },
    9: { accountsConfigs: [main, looter2, ] },
    //10: [[], [5355, 5357, 6152], []],
}