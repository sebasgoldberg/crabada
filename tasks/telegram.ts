import { task } from "hardhat/config";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Context, Telegraf } from "telegraf";
import { getDashboardContent, getSigner, LOOT_PENDING_CONFIG } from "./crabada";
import { playerWithdrawErc20 } from "./player";

task(
    "telegram",
    "Run a telegram bot.",
    async ({  }, hre: HardhatRuntimeEnvironment) => {

        const bot = new Telegraf(process.env.BOT_TOKEN,{handlerTimeout: 300_000 })

        function isValidUser(ctx:Context): boolean {
            if (ctx.from 
                && ctx.from.username 
                && ctx.from.username == 'sebasgoldberg'){
                return true;
            }

            ctx.reply(`ERROR: Invalid user.`);
            return false
        
        }

        bot.start(async (ctx) => {

            if (!isValidUser(ctx)){
                return
            }
        
            ctx.reply('/resume')
            ctx.reply('/players')

        })
        
        bot.command('resume', async (ctx) => {

            if (!isValidUser(ctx)){
                return
            }
        
            const {
                avax,
                rewards,
            } = await getDashboardContent(hre)

            ctx.reply(`
AVAX consumed 
${ avax.avaxConsumed }

LOOTERS 
${ avax.looters.map( l => l.balance ).join('\n') }

SETTLER 
${ avax.settler.balance }

REINFORCER 
${ avax.reinforcer.balance }
            `)

            ctx.reply(`
TUS Rewards
${ rewards.TUS }

CRA Rewards
${ rewards.CRA }
            `)
        })

        bot.command('players', async (ctx) => {

            if (!isValidUser(ctx)){
                return
            }
        
            const {
                players
            } = await getDashboardContent(hre)

            players.forEach( player => {

                player.teams.forEach( team => {
                    ctx.reply(`
Team ${ team.id } ${ team.faction }
props: ${ team.info.props.bp }(${ team.info.props.rbp }) ${ team.info.props.mp }
secondsToUnlock: ${ team.info.secondsToUnlock }

currentGame: ${ team.info.currentGame }
attackReinforcements: ${ team.info.gameInfo.attackReinforcements }
defenseReinforcements: ${ team.info.gameInfo.defenseReinforcements }

Miner: ${ team.info.gameInfo.miner.id } ${ team.info.gameInfo.miner.faction }
props: ${ team.info.gameInfo.miner.props.bp }(${ team.info.gameInfo.miner.props.rbp }) ${ team.info.gameInfo.miner.props.mp }
                    `)
                    
                })

            })
        })

        bot.hears('withdraw', async (ctx) => {

            if (!isValidUser(ctx)){
                return
            }

            const signer = await getSigner(hre)

            const playerAddresses: string[] = LOOT_PENDING_CONFIG.players.map(p=>p.address)

            await playerWithdrawErc20(hre, signer, playerAddresses, 
                (...data: any[]) => {
                    console.log(...data)
                    ctx.reply(data.map(x=>String(x)).join('\n'))
                }
            )
        })


        bot.launch()

        await (new Promise( () => {}))

    })
