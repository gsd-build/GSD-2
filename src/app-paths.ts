import { homedir } from 'os'
import { join } from 'path'

export const appRoot = process.env.GSD_HOME || join(homedir(), '.gsd')
export const agentDir = join(appRoot, 'agent')
export const sessionsDir = join(appRoot, 'sessions')
export const authFilePath = join(agentDir, 'auth.json')
