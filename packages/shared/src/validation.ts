import { z } from 'zod';

/**
 * Rules for anything a user types or a client sends.
 *
 * The server must check every message itself, because anyone can open the
 * browser console and send whatever they like. The web app uses the same
 * rules to show friendly errors before sending.
 */

/**
 * Room codes use consonants only. With no vowels, a random code can't spell
 * a word, rude or otherwise. That also rules out I and O, which get mixed up
 * with 1 and 0. Q is out too: in the TV's display font it looks like an O.
 * 19 letters, 4 at a time, still gives 130,321 possible codes.
 */
export const ROOM_CODE_ALPHABET = 'BCDFGHJKLMNPRSTVWXZ';
export const ROOM_CODE_LENGTH = 4;
export const TEAM_NAME_MAX_LENGTH = 24;
export const MAX_PLAYERS_PER_ROOM = 50;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH, `Room codes are ${ROOM_CODE_LENGTH} letters`)
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`), "That doesn't look like a room code");

export const teamNameSchema = z
  .string()
  .trim()
  .min(1, 'Pick a team name')
  .max(TEAM_NAME_MAX_LENGTH, `Keep it under ${TEAM_NAME_MAX_LENGTH} characters`);

const tokenSchema = z.string().min(10).max(100);

export const SAMPLE_QUIZ_ID = 'sample';
export const hostCreatePayloadSchema = z.object({
  quizId: z.union([z.literal(SAMPLE_QUIZ_ID), z.uuid("That quiz doesn't exist")]),
});
export const joinPayloadSchema = z.object({ code: roomCodeSchema, name: teamNameSchema });
export const playerResumePayloadSchema = z.object({ code: roomCodeSchema, playerToken: tokenSchema });
export const hostResumePayloadSchema = z.object({ code: roomCodeSchema, hostToken: tokenSchema });
export const answerPayloadSchema = z.object({
  questionIndex: z.number().int().min(0),
  optionIndex: z.number().int().min(0).max(3),
});
