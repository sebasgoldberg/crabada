import { task } from "hardhat/config";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Context, Telegraf } from "telegraf";
import { ATTACK_MODE, getDashboardContent, MINE_MODE, refillavax, withdrawRewards } from "./crabada";

task(
    "telegram",
    "Run a telegram bot.",
    async ({  }, hre: HardhatRuntimeEnvironment) => {

        const bot = new Telegraf(process.env.BOT_TOKEN,{handlerTimeout: 300_000 })

        function isValidUser(ctx:Context): boolean {
            if (ctx.from 
                && ( 
                    ( ctx.from.username && ctx.from.username == 'sebasgoldberg' )
                    || ( ctx.from.id == 1166897567 ) 
                    ) 
                ){
                return true;
            }

            ctx.reply(`ERROR: Invalid user '${JSON.stringify(ctx.from)}'.`);
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
                // rewards,
                players
            } = await getDashboardContent(hre, undefined)

            ATTACK_MODE && ctx.reply(`
AVAX consumed 
${ avax.avaxConsumed }

LOOTERS 
${ avax.looters.map( l => l.balance ).join('\n') }

SETTLER 
${ avax.settler.balance }
            `)

            MINE_MODE && ctx.reply(`
AVAX consumed 
${ avax.avaxConsumed }

MINERS 
${ avax.miners.map( l => l.balance ).join('\n') }
            `)

            ctx.reply(`
            `)

            const secondsToUnlock: number[] = players
                .flatMap( ({ teams }) => teams.map( ({ info: { secondsToUnlock }}) => secondsToUnlock ) )

            const revenge: number[] = players
                .flatMap( ({ teams }) => teams.map( ({ info: { gameInfo: { minersRevenge: minersRevange } }}) => minersRevange ) )

            ctx.reply(`
Players unlocked
${ secondsToUnlock.filter( x => x < 0 ).length }

Seconds To Unlock
${ secondsToUnlock.sort((a,b)=> a<b?-1:a>b?1:0) }

REVENGE
${ revenge.sort((a,b)=> a<b?-1:a>b?1:0).map(x=> `${x}%`) }
${ revenge.reduce((prev, curr)=>prev+curr, 0)/revenge.length }
            `)

        })

        bot.command('players', async (ctx) => {

            if (!isValidUser(ctx)){
                return
            }
        
            const {
                players
            } = await getDashboardContent(hre, undefined)

            players.forEach( player => {

                player.teams.forEach( team => {
                    ctx.reply(`
Team ${ team.id } ${ team.faction }
props: ${ team.info.props.bp }(${ team.info.props.rbp }) ${ team.info.props.mp }
secondsToUnlock: ${ team.info.secondsToUnlock }

currentGame: ${ team.info.currentGame }
attackReinforcements: ${ team.info.gameInfo.attackReinforcements }
defenseReinforcements: ${ team.info.gameInfo.defenseReinforcements }
minersRevance: ${ team.info.gameInfo.minersRevenge }

Other team: ${ team.info.gameInfo.otherTeam.id } ${ team.info.gameInfo.otherTeam.faction }
props: ${ team.info.gameInfo.otherTeam.props.bp }(${ team.info.gameInfo.otherTeam.props.rbp }) ${ team.info.gameInfo.otherTeam.props.mp }
                    `)
                    
                })

            })
        })

        const telegramLogFunction = (ctx) => {
            return (...data: any[]) => {
                console.log(...data)
                ctx.reply(data.map(x=>String(x)).join('\n'))
            }
        }

        bot.hears('withdraw', async (ctx) => {

            if (!isValidUser(ctx)){
                return
            }

            try {
                await withdrawRewards(hre, telegramLogFunction(ctx))                
            } catch (error) {
                telegramLogFunction(ctx)(String(error))
            }

        })

        bot.hears('refill', async (ctx) => {

            if (!isValidUser(ctx)){
                return
            }

            try {
                await refillavax(hre, telegramLogFunction(ctx))
            } catch (error) {
                telegramLogFunction(ctx)(String(error))
            }

        })


        bot.launch()

        await (new Promise( () => {}))

    })
