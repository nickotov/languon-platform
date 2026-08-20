import { describe, expect, it } from 'vitest';

import {
    parseAdministrationCommand,
    parseAdministrationRequest,
} from '../../../../src/infrastructure/administration/admin-command';

describe('administration operator command', () => {
    it('parses a confirmed bootstrap grant without inventing an actor', () => {
        expect(
            parseAdministrationCommand([
                'grant',
                '--email',
                'Owner@Example.com',
                '--reason',
                'Initial owner bootstrap',
                '--confirm',
                'admin-membership-change',
            ]),
        ).toEqual({
            command: 'grant',
            confirm: 'admin-membership-change',
            email: 'owner@example.com',
            reason: 'Initial owner bootstrap',
        });
    });

    it('requires an explicit actor for audit pruning', () => {
        expect(() =>
            parseAdministrationCommand([
                'prune',
                '--reason',
                'Scheduled retention enforcement',
                '--confirm',
                'admin-membership-change',
            ]),
        ).toThrow();
    });

    it('validates a structured request read from standard input', () => {
        expect(
            parseAdministrationRequest({
                actorEmail: 'Actor@Example.com',
                command: 'revoke',
                confirm: 'admin-membership-change',
                email: 'Owner@Example.com',
                reason: 'Owner rotation completed',
            }),
        ).toEqual({
            actorEmail: 'actor@example.com',
            command: 'revoke',
            confirm: 'admin-membership-change',
            email: 'owner@example.com',
            reason: 'Owner rotation completed',
        });
        expect(() =>
            parseAdministrationRequest({
                command: 'list',
                reason: 'must not be accepted',
            }),
        ).toThrow();
    });

    it('rejects missing confirmation, unknown flags, and options on list', () => {
        expect(() =>
            parseAdministrationCommand([
                'revoke',
                '--email',
                'owner@example.com',
                '--reason',
                'Owner rotation completed',
            ]),
        ).toThrow();
        expect(() =>
            parseAdministrationCommand([
                'list',
                '--email',
                'owner@example.com',
            ]),
        ).toThrow(/does not accept options/);
        expect(() =>
            parseAdministrationCommand(['list', '--password', 'secret']),
        ).toThrow(/Unknown option/);
    });
});
