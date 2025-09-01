import { describe, expect, it } from 'bun:test'
import * as v from 'valibot'
import { HonoActionError, type ActionErrorCode } from '../src/error'

describe('HonoActionError', () => {
    describe('constructor', () => {
        it('should create an error with basic properties', () => {
            const error = new HonoActionError({
                message: 'Test error message',
                code: 'UNKNOWN_ERROR',
            })

            expect(error).toBeInstanceOf(Error)
            expect(error).toBeInstanceOf(HonoActionError)
            expect(error.name).toBe('HonoActionError')
            expect(error.message).toBe('Test error message')
            expect(error.code).toBe('UNKNOWN_ERROR')
            expect(error.issue).toBeUndefined()
        })

        it('should create an error with validation issue', () => {
            const schema = v.object({
                email: v.string(),
                age: v.number(),
            })

            const result = v.safeParse(schema, {
                email: 'invalid',
                age: 'not-a-number',
            })
            const issue = result.issues?.[0]

            const error = new HonoActionError({
                message: 'Validation failed',
                code: 'INPUT_VALIDATION_ERROR',
                issue,
            })

            expect(error.issue).toBe(issue)
            expect(error.code).toBe('INPUT_VALIDATION_ERROR')
        })
    })

    describe('error codes', () => {
        it('should support all defined error codes', () => {
            const codes: ActionErrorCode[] = [
                'INPUT_VALIDATION_ERROR',
                'EXTERNAL_API_ERROR',
                'INTERNAL_SERVER_ERROR',
                'UNKNOWN_ERROR',
                'LOCATION_NOT_FOUND',
                'SESSION_NOT_FOUND',
            ]

            codes.forEach((code) => {
                const error = new HonoActionError({
                    message: `Error with code: ${code}`,
                    code,
                })
                expect(error.code).toBe(code)
            })
        })
    })

    describe('error inheritance', () => {
        it('should properly inherit from Error', () => {
            const error = new HonoActionError({
                message: 'Test error',
                code: 'UNKNOWN_ERROR',
            })

            expect(error instanceof Error).toBe(true)
            expect(error.stack).toBeDefined()
        })

        it('should maintain error stack trace', () => {
            const error = new HonoActionError({
                message: 'Test error',
                code: 'UNKNOWN_ERROR',
            })

            expect(error.stack).toContain('HonoActionError')
        })
    })

    describe('error serialization', () => {
        it('should be JSON serializable', () => {
            const error = new HonoActionError({
                message: 'Test error',
                code: 'UNKNOWN_ERROR',
            })

            // Error objects don't serialize message/name by default
            const serialized = JSON.stringify(error)
            const parsed = JSON.parse(serialized)

            expect(parsed.code).toBe('UNKNOWN_ERROR')
        })

        it('should include issue in serialization when present', () => {
            const schema = v.object({
                email: v.string(),
            })

            const result = v.safeParse(schema, { email: 123 })
            const issue = result.issues?.[0]

            const error = new HonoActionError({
                message: 'Validation failed',
                code: 'INPUT_VALIDATION_ERROR',
                issue,
            })

            const serialized = JSON.stringify(error)
            const parsed = JSON.parse(serialized)

            expect(parsed.issue).toBeDefined()
            expect(parsed.issue.message).toBeDefined()
        })
    })

    describe('error comparison', () => {
        it('should allow error code comparison', () => {
            const error1 = new HonoActionError({
                message: 'Error 1',
                code: 'INPUT_VALIDATION_ERROR',
            })

            const error2 = new HonoActionError({
                message: 'Error 2',
                code: 'INPUT_VALIDATION_ERROR',
            })

            expect(error1.code).toBe(error2.code)
        })

        it('should distinguish between different error codes', () => {
            const validationError = new HonoActionError({
                message: 'Validation error',
                code: 'INPUT_VALIDATION_ERROR',
            })

            const apiError = new HonoActionError({
                message: 'API error',
                code: 'EXTERNAL_API_ERROR',
            })

            expect(validationError.code).not.toBe(apiError.code)
        })
    })

    describe('error handling patterns', () => {
        it('should work with try-catch blocks', () => {
            const throwError = () => {
                throw new HonoActionError({
                    message: 'Test error',
                    code: 'UNKNOWN_ERROR',
                })
            }

            try {
                throwError()
                expect(true).toBe(false) // Should not reach here
            } catch (error) {
                expect(error).toBeInstanceOf(HonoActionError)
                if (error instanceof HonoActionError) {
                    expect(error.code).toBe('UNKNOWN_ERROR')
                }
            }
        })

        it('should work with instanceof checks', () => {
            const error = new HonoActionError({
                message: 'Test error',
                code: 'UNKNOWN_ERROR',
            })

            expect(error instanceof HonoActionError).toBe(true)
            expect(error instanceof Error).toBe(true)
        })
    })
})
