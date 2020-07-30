import { Octokit } from "@octokit/rest/index"
import { Context } from "@actions/github/lib/context"
import { default as _core } from "@actions/core"
import Ur from "ur-game"

import { addReaction } from '@/issues'
import { handleError } from '@/error'
import { resetGame } from '@/new'
import { makeMove } from '@/move'
import { makeCommit } from '@/commit'
import { playerIsOnTeam } from '@/player'
import { Log } from '@/log'

export interface Change {
  path: string
  content: string | null
}

export default async function play (
  title: string,
  octokit: Octokit,
  context: Context,
  core: typeof _core,
): Promise<void> {
  /**
   * Let's play Ur!
   *
   * This project is inspired by timburgan/timburgan - thank you Tim!
   *
   * Recieves parameters from actions/github-script:
   * @param title: The title of the triggering issue.
   * @param octokit: octokit/rest.js client.
   * @param context: Workflow context object.
   * @returns void: At least until I work out what this should do!
   */
  // The Octokit client comes pre-authenticated, so there's no need to
  // instantiate it.

  const gamePath = "games/current"
  const oldGamePath = "games"

  // Prepare a list of changes, which will be made into a single commit to the
  // play branch
  let changes: Change[] = []

  // Prepare a log object, which will be used to merge log entries into a
  // single change
  const log = new Log(gamePath, octokit, context)
  await log.prepareInitialLog()

  try {
    addReaction("eyes", octokit, context)

    const [command, move] = parseIssueTitle(title)

    if (command === "new") {
      changes = changes.concat(
        await resetGame(gamePath, oldGamePath, octokit, context, log)
      )
    } else if (command === "move") {
      changes = changes.concat(
        await makeMove(move, gamePath, octokit, context, log)
      )
    }

    // Extract changes from the log
    changes = changes.concat(log.makeLogChanges())

    // All the changes have been collected - commit them
    await makeCommit(
      `@${context.actor} ${command === "new" ? "Start a new game" : `Move ${playerIsOnTeam(context.actor, Ur.BLACK) ? "black" : "white"} ${move}`} (#${context.issue.number})`,
      changes,
      octokit,
      context,
    )

    addReaction("rocket", octokit, context)
  } catch (error) {
    // If there was an error, forward it to the user, then stop
    handleError(error, octokit, context, core)
    return
  }
}

function parseIssueTitle (
  title: string,
): ["new" | "move", string, number] {
  /**
   * Parses the issue title into move instructions.
   *
   * @param title: The title of the issue.
   */
  const [gamename, command, move, gameId] = title.split("-")
  if (!gamename || gamename !== "ur") {
    throw new Error('WRONG_GAME')
  }
  if (!command || !["new", "move"].includes(command)) {
    throw new Error('UNKNOWN_COMMAND')
  }
  if (command === "move") {
    if (!move) {
      throw new Error('NO_MOVE_GIVEN')
    }
    if (!gameId) {
      throw new Error('NO_ID_GIVEN')
    }
    if (!/\d+@\d+/.test(move)) {
      throw new Error('MOVE_BAD_FORMAT')
    }
    if(isNaN(parseInt(gameId))) {
      throw new Error('NON_NUMERIC_ID')
    }
  }
  return [command as "new" | "move", move, parseInt(gameId)]
}