import { WebClient } from '@slack/web-api'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config()

// Configuration
const SLACK_CHANNEL_ID = 'C0ADASX2SSH'
const BATCH_LIMIT = 1000 // Max allowed by Slack API

// Interface for the intermediate map key
export interface SwapKey {
  chain: string
  tokenIn: string
  tokenOut: string
}

// Interface for the final output item
export interface SwapStat extends SwapKey {
  frequency: number
}

// Regex pattern
const SWAP_PATTERN =
  /chain:\s*(?<chain>.+)\n*tokenIn:\s*(?<tokenIn>.+)\n*tokenOut:\s*(?<tokenOut>.+)\n*swapKind:\s*(?<swapKind>.+)\n*swapAmount:\s*(?<swapAmount>.+)/i

/**
 * Calculates the start and end timestamps for the previous full week (Monday to Sunday).
 * Returns timestamps in Seconds (Slack API format) and the Year/Week number for file naming.
 *
 * @param referenceDate Optional date to calculate relative to (defaults to now)
 */
export function getPreviousWeekRange(referenceDate: Date = new Date()) {
  const now = new Date(referenceDate)

  // Get the current day of the week (0-6, 0 is Sunday)
  const dayOfWeek = now.getUTCDay()

  // Calculate days to subtract to get to the *current* week's Monday
  const daysSinceMonday = (dayOfWeek + 6) % 7

  // Create a date object for "Start of Current Week (Monday)"
  const startOfCurrentWeek = new Date(now)
  startOfCurrentWeek.setUTCDate(now.getUTCDate() - daysSinceMonday)
  startOfCurrentWeek.setUTCHours(0, 0, 0, 0)

  // "Start of Previous Week" is 7 days before Start of Current Week
  const startOfPreviousWeek = new Date(startOfCurrentWeek)
  startOfPreviousWeek.setUTCDate(startOfCurrentWeek.getUTCDate() - 7)

  // "End of Previous Week" is 1 millisecond before Start of Current Week
  // const endOfPreviousWeek = new Date(startOfCurrentWeek)
  // endOfPreviousWeek.setTime(endOfPreviousWeek.getTime() - 1)
  const endOfPreviousWeek = new Date()

  return {
    start: Math.floor(startOfPreviousWeek.getTime() / 1000), // Seconds
    end: Math.floor(endOfPreviousWeek.getTime() / 1000), // Seconds
    year: startOfPreviousWeek.getUTCFullYear(),
    weekNum: getISOWeekNumber(startOfPreviousWeek),
  }
}

/**
 * Returns the ISO week number (1-53) for a given date.
 */
function getISOWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Parses raw message strings and aggregates swap statistics.
 *
 * @param messages Array of raw message strings
 * @returns Sorted array of SwapStat objects
 */
export function calculateStats(messages: string[]): SwapStat[] {
  const frequencyMap: Record<string, number> = {}

  for (const text of messages) {
    if (!text) continue

    const match = text.match(SWAP_PATTERN)
    if (match && match.groups) {
      // Extract only the key fields we care about for grouping
      const swapKey: SwapKey = {
        chain: match.groups.chain.trim(),
        tokenIn: match.groups.tokenIn.trim(),
        tokenOut: match.groups.tokenOut.trim(),
      }

      const keyString = JSON.stringify(swapKey)
      frequencyMap[keyString] = (frequencyMap[keyString] || 0) + 1
    }
  }

  // Convert map to array and sort
  return Object.entries(frequencyMap)
    .map(([keyString, count]) => {
      const key = JSON.parse(keyString) as SwapKey
      return {
        ...key,
        frequency: count,
      }
    })
    .sort((a, b) => b.frequency - a.frequency)
}

async function fetchAndProcessMessages() {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN)
  const range = getPreviousWeekRange()
  const weekStr = range.weekNum.toString().padStart(2, '0')
  const outputDir = path.join(__dirname, `../stats/${range.year}`)
  const outputFile = path.join(outputDir, `week-${weekStr}.json`)

  console.log(`Targeting Previous Week: Year ${range.year}, Week ${range.weekNum}`)
  console.log(`Range: ${new Date(range.start * 1000).toUTCString()} to ${new Date(range.end * 1000).toUTCString()}`)

  // Create directory if it doesn't exist
  fs.mkdirSync(outputDir, { recursive: true })

  let cursor: string | undefined
  let hasMore = true
  let totalMessages = 0
  const allMessages: string[] = []

  try {
    while (hasMore) {
      console.log('Fetching batch...')
      const result = await client.conversations.history({
        channel: SLACK_CHANNEL_ID,
        limit: BATCH_LIMIT,
        oldest: range.start.toString(),
        latest: range.end.toString(),
        cursor: cursor,
      })

      console.log(result)

      if (!result.messages || result.messages.length === 0) {
        hasMore = false
        break
      }

      totalMessages += result.messages.length

      // Collect raw text for processing
      for (const msg of result.messages) {
        if (msg.text) {
          allMessages.push(msg.text)
        }
      }

      if (result.has_more && result.response_metadata?.next_cursor) {
        cursor = result.response_metadata.next_cursor
      } else {
        hasMore = false
      }
    }

    console.log(`Total processed messages: ${totalMessages}`)

    // Calculate Stats (Business Logic)
    const sortedStats = calculateStats(allMessages)

    console.log(`Total matching swap messages: ${sortedStats.reduce((acc, curr) => acc + curr.frequency, 0)}`)
    console.log(`Unique swap pairs: ${sortedStats.length}`)

    // Write stats to file (overwrite if exists)
    fs.writeFileSync(outputFile, JSON.stringify(sortedStats, null, 2))
    console.log(`Stats written to ${outputFile}`)
  } catch (error) {
    console.error('Error fetching messages:', error)
    process.exit(1)
  }
}

// Only execute if run directly
if (require.main === module) {
  fetchAndProcessMessages()
}
