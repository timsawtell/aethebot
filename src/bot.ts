/**
 * The chatbot itself.
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
import { Brain, MemoryBrain } from "./brain"
import { Feature, FeatureConstructor } from "./features"
import * as Features from "./features"
import { log } from "./log"

export class Bot {
    public brain: Brain = new MemoryBrain()
    public user: Discord.ClientUser | null = null
    public token: string
    public features: Array<FeatureConstructor<Feature>> = []
    private loadedFeatures: Map<string, Feature> = new Map()
    private client: Discord.Client

    constructor(token: string) {
        this.token = token
        this.client = this.makeClient()
    }

    public reconnect() {
        log("reconnecting to discord")
        this.client.destroy().then(() => {
            this.client = this.makeClient()
            this.login()
        }).catch(console.error)
    }

    public login() {
        this.client.login(this.token)
    }

    public fetchUser(id: string): Promise<Discord.User> {
        return this.client.fetchUser(id)
    }

    // Returns a Discord channel for the given ID, or null if that channel is
    // now unavailable for whatever reason
    public fetchChannel(id: string): Discord.Channel | null {
        return this.client.channels.find("id", id) || null
    }

    public loadedFeatureForCtor<F extends Feature>(ctor: FeatureConstructor<F>): F | null {
        for (const [_, feature] of this.loadedFeatures) {
            if (feature instanceof ctor) {
                return feature as F
            }
        }
        return null
    }

    public loadedFeatureForName<F extends Feature>(name: string): F | null {
        return this.loadedFeatures.get(name) as F || null
    }

    private makeClient() {
        const client = new Discord.Client()
        client.on("message", this.receiveMessage.bind(this))
        client.on("ready", () => {
            this.user = this.client.user
            if (process.env.NODE_ENV !== "production") {
                this.client.fetchApplication().then((app) => {
                    log(`Join this bot to servers at ` +
                        `https://discordapp.com/oauth2/authorize?&client_id=${app.id}&scope=bot&permissions=0`)
                })
            }
            this.loadFeatures()
        })
        return client
    }

    private loadFeatures() {
        if (!this.features || this.features.length === 0) {
            log("warn: No features loaded!")
            return
        }
        this.loadedFeatures = new Map()
        for (const FeatureCtor of this.features) {
            const feature = new FeatureCtor(this, FeatureCtor.name)
            this.loadedFeatures.set(FeatureCtor.name, feature)
        }
    }

    private receiveMessage(msg: Discord.Message) {
        for (const [_, feature] of this.loadedFeatures) {
            if (feature.handlesMessage(msg)) {
                feature.handleMessage(msg)
            }
        }
    }
}
