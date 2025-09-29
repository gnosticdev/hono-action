import { describe, expect, it } from 'vitest'
import { reservedRoutes } from '../src/lib/utils'

describe('Utils', () => {
    describe('reservedRoutes', () => {
        it('should contain expected reserved routes', () => {
            expect(reservedRoutes).toContain('_astro')
            expect(reservedRoutes).toContain('_actions')
            expect(reservedRoutes).toContain('_server_islands')
        })

        it('should be an array', () => {
            expect(Array.isArray(reservedRoutes)).toBe(true)
        })

        it('should contain only strings', () => {
            reservedRoutes.forEach((route) => {
                expect(typeof route).toBe('string')
            })
        })

        it('should have correct length', () => {
            expect(reservedRoutes).toHaveLength(3)
        })

        it('should not contain empty strings', () => {
            reservedRoutes.forEach((route) => {
                expect(route.length).toBeGreaterThan(0)
            })
        })

        it('should not contain duplicates', () => {
            const uniqueRoutes = new Set(reservedRoutes)
            expect(uniqueRoutes.size).toBe(reservedRoutes.length)
        })

        it('should match Astro documentation', () => {
            // These routes are documented in Astro's routing guide
            const expectedRoutes = ['_astro', '_actions', '_server_islands']
            expect(reservedRoutes).toEqual(expectedRoutes)
        })
    })
})
