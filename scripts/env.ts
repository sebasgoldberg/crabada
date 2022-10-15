import * as dotenv from 'dotenv'
dotenv.config()

export const env = {
    SWIMMER_TEST_MINE_CONFIG: JSON.parse(process.env.SWIMMER_TEST_MINE_CONFIG),
    SWIMMER_MINE_CONFIG: JSON.parse(process.env.SWIMMER_MINE_CONFIG),
    MAINNET_MINE_CONFIG: JSON.parse(process.env.MAINNET_MINE_CONFIG),
    SWIMMER_TEST_MINE_GROUPS: JSON.parse(process.env.SWIMMER_TEST_MINE_GROUPS),
    SWIMMER_MINE_GROUPS: JSON.parse(process.env.SWIMMER_MINE_GROUPS),
    MAINNET_MINE_GROUPS: JSON.parse(process.env.MAINNET_MINE_GROUPS),
}
