"use client";
import { useState } from "react";
import { useChannel } from "./use-channel.js";
/**
 * Track the presence member list of a channel ("Ana is viewing this booking").
 * Returns the current members; `profile` is announced as this client's entry.
 */
export function usePresence(channel, profile) {
    const [members, setMembers] = useState([]);
    useChannel(channel, { profile, onPresence: setMembers });
    return members;
}
