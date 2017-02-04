/**
 * Looks for times in chat and helps with timezones.
 */

/*
 * AetheBot - A Discord Chatbot
 * 
 * Created by Tyrone Trevorrow on 03/02/17.
 * Copyright (c) 2017 Tyrone Trevorrow. All rights reserved.
 * 
 * This source code is licensed under the permissive MIT license.
 */

import * as Discord from "discord.js"
import {Feature} from "./feature"
import * as Chrono from "chrono-node"
import * as Moment from "moment-timezone"
import {log} from "../log"

const MAXIMUM_TIMEZONES = 4

export class TimehelperFeature extends Feature {
    timezoneForUser(userId: string): Promise<string> {
        const key = `th:tz:${userId}`
        return this.bot.brain.get(key)
    }

    setTimezoneForUser(timezone: string, userId: string) {
        const key = `th:tz:${userId}`
        this.bot.brain.set(key, timezone)
        this.updateTimezonedUsers(userId, false)
    }

    removeTimezoneForUser(user: Discord.User) {
        const key = `th:tz:${user.id}`
        this.bot.brain.remove(key)
        this.updateTimezonedUsers(user.id, true)
    }

    /** Async as fuck -- it could potentially take a really long time to 
     * return. You better hope the brain is really fast.
     */
    async userTimezones(): Promise<string[]> {
        const key = "th:tzusers"
        const userIdsStr = await this.bot.brain.get(key)
        const userIds = userIdsStr.split(",")
        let zones: string[] = []
        for (const userId of userIds) {
            const zone = await this.timezoneForUser(userId)
            zones.push(zone)
        }
        zones.slice(0, MAXIMUM_TIMEZONES)
        return zones
    }

    async updateTimezonedUsers(updatedUserId: string, removed: boolean) {
        const key = "th:tzusers"
        const userIdsStr = (await this.bot.brain.get(key)) || ""
        const userIds = userIdsStr.split(",")
        if (removed) {
            userIds.splice(userIds.indexOf(updatedUserId), 1)
            this.bot.brain.set(key, userIds.join(","))
        } else {
            if (userIds.indexOf(updatedUserId) !== -1) {
                return
            }
            userIds.push(updatedUserId)
            this.bot.brain.set(key, userIds.join(","))
        }
    }

    handleMessage(message: Discord.Message): boolean {
        if (message.author.equals(this.bot.user)) {
            return false
        }
        if (message.isMentioned(this.bot.user) &&
            message.mentions.users.size === 1) {
            // This is likely a command
            return this.handleCommand(message)
        }

        this.handleAmbientMessage(message)
        return false
    }

    async handleAmbientMessage(message: Discord.Message) {
        // Remove the mentions
        const tokens = this.commandTokens(message)
        const mentionRegex = /\<\@\d+\>/g
        const noMentions = tokens.filter((token) => !mentionRegex.test(token))
        const cleanMsg = noMentions.join(" ")
        const timezone = await this.timezoneForUser(message.author.id)
        if (!timezone || !Moment.tz.zone(timezone)) {
            return
        }
        const zoneinfo = Moment.tz.zone(timezone)
        const zoneoffset = zoneinfo.offset(Number(new Date())) * -1

        const outZones = (await this.userTimezones()).map((z) => z.toLowerCase())
        // Filter out the messager's timezone
        outZones.splice(outZones.indexOf(timezone.toLowerCase()), 1)
        if (outZones.length === 0) {
            // No timezones to translate to
            return
        }

        const results = Chrono.parse(cleanMsg)
        if (!results || results.length === 0) {
            return
        }
        const format = 'MMM Do ha z'
        const embed = new Discord.RichEmbed()
        embed.setTitle("Timezone Helper")
        embed.setColor("#FF5200")
        for (const result of results) {
            if (!result.start.get("timezoneOffset")) {
                result.start.assign("timezoneOffset", zoneoffset)
            }
            let date = Moment(result.start.date())
            const zonesStrs = outZones.map((z) => date.tz(z).format(format))
            const zonesStr = zonesStrs.join(", ")
            embed.addField(`${date.tz(timezone).format(format)}`, `${zonesStr}`)
        }
        message.channel.sendEmbed(embed)
        return false
    }

    handleCommand(message: Discord.Message): boolean {
        const tokens = this.commandTokens(message)
        if (tokens.length === 2 &&
            tokens[0].toLowerCase() === "timezone") {
            const timezone = tokens[1]
            const removeKeywords = [
                "remove", "delete", "delet", "nil", "null", "none"
            ]
            if (removeKeywords.indexOf(timezone.toLowerCase()) !== -1) {
                this.removeTimezoneForUser(message.author)
                this.replyWith(message, "ok")
                return true
            }
            if (!Moment.tz.zone(timezone)) {
                this.replyWith(message, "I don't recognise that timezone")
                return true
            }
            this.setTimezoneForUser(timezone, message.author.id)
            this.replyWith(message, "ok")
            return true
        } else {
            return false
        }
    }
}