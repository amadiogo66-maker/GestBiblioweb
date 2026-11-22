import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './helpers/local-db';
import { runTsScript } from './helpers/run-script';
import { encryptMfaSecret, generateTotpSecret, hashActivationCode } from '@/lib/staff-mfa';
import { replaceRecoveryCodes } from '@/lib/staff-mfa-store';

const suffix = randomUUID().slice(0, 8);
const userIds: string[] = [];
const CODE = /[A-Z2-7]{5}(?:-[A-Z2-7]{5}){3}/;
let counter = 0;

async function createUser(): Promise<{ id: string; email: string }> {
  counter += 1;
  const email = `mfa-script-${counter}-${suffix}@test.local`;
  const user = await prisma.user.create({
    data: { email, username: `mfa_script_${counter}_${suffix}`, password: 'x', firstName: 'Script', lastName: 'Test', status: 'ACTIVE' },
  });
  userIds.push(user.id);
  return { id: user.id, email };
}

const grant = (email: string, role: string, ...flags: string[]) => runTsScript('scripts/staff-grant.ts', ['grant', email, role, ...flags]);
const revoke = (email: string, role: string, ...flags: string[]) => runTsScript('scripts/staff-grant.ts', ['revoke', email, role, ...flags]);
const reset = (email: string, ...flags: string[]) => runTsScript('scripts/staff-mfa-reset.ts', [email, ...flags]);
const tokens = (id: string) => prisma.verificationToken.findMany({ where: { identifier: `staff-mfa-activation:${id}` } });

afterAll(async () => {
  await prisma.activityLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.verificationToken.deleteMany({ where: { identifier: { in: userIds.map((id) => `staff-mfa-activation:${id}`) } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('scripts du personnel (base locale)', () => {
  it('staff:grant : simulation sans écriture, puis code affiché une fois et stocké haché', async () => {
    const { id, email } = await createUser();

    const dry = grant(email, 'LIBRARIAN');
    expect(dry).toContain('Base visée : localhost');
    expect(dry).not.toMatch(CODE);
    expect(await prisma.staffAssignment.count({ where: { userId: id } })).toBe(0);
    expect(await tokens(id)).toHaveLength(0);

    const output = grant(email, 'LIBRARIAN', '--yes');
    const code = output.match(CODE)![0];
    const stored = await tokens(id);

    expect(stored).toHaveLength(1);
    expect(stored[0].token).toBe(hashActivationCode(code));
    expect(stored[0].token).not.toContain(code);
    expect(stored[0].expires.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect(JSON.stringify(await prisma.activityLog.findMany({ where: { userId: id } }))).not.toContain(code);
  }, 60_000);

  it('staff:grant : MFA déjà active → aucun code', async () => {
    const { id, email } = await createUser();
    await prisma.staffMfa.create({ data: { userId: id, secretCipher: encryptMfaSecret(generateTotpSecret()), enabledAt: new Date() } });

    expect(grant(email, 'ADMIN', '--yes')).not.toMatch(CODE);
    expect(await tokens(id)).toHaveLength(0);
  }, 60_000);

  it('staff:mfa-reset : exige --yes ; époque +1, secret et codes supprimés, nouveau code, journalisé', async () => {
    const { id, email } = await createUser();
    await prisma.staffAssignment.create({ data: { userId: id, role: 'ADMIN' } });
    await prisma.staffMfa.create({ data: { userId: id, secretCipher: encryptMfaSecret(generateTotpSecret()), enabledAt: new Date() } });
    await replaceRecoveryCodes(prisma, id);

    expect(reset(email)).toContain('Simulation');
    expect(await prisma.staffMfa.findUniqueOrThrow({ where: { userId: id } })).toMatchObject({ epoch: 1 });

    const output = reset(email, '--yes');
    const code = output.match(CODE)![0];

    expect(output).toContain('Base visée : localhost');
    expect(await prisma.staffMfa.findUniqueOrThrow({ where: { userId: id } })).toMatchObject({ epoch: 2, secretCipher: '', enabledAt: null, lastUsedStep: null });
    expect(await prisma.staffRecoveryCode.count({ where: { userId: id } })).toBe(0);
    expect((await tokens(id))[0].token).toBe(hashActivationCode(code));
    const log = await prisma.activityLog.findFirstOrThrow({ where: { userId: id, action: 'auth.mfa.reset' } });
    expect(JSON.stringify(log)).not.toContain(code);
  }, 60_000);

  it('staff:mfa-reset : refuse un compte sans affectation active', async () => {
    const { email } = await createUser();

    expect(() => reset(email, '--yes')).toThrow();
  }, 30_000);

  it('staff:revoke : conserve la MFA tant qu’une affectation reste, la supprime à la dernière', async () => {
    const { id, email } = await createUser();
    await prisma.staffAssignment.createMany({ data: [{ userId: id, role: 'ADMIN' }, { userId: id, role: 'LIBRARIAN' }] });
    await prisma.staffMfa.create({ data: { userId: id, secretCipher: encryptMfaSecret(generateTotpSecret()), enabledAt: new Date() } });
    await replaceRecoveryCodes(prisma, id);

    revoke(email, 'ADMIN', '--yes');
    expect(await prisma.staffMfa.count({ where: { userId: id } })).toBe(1);
    expect(await prisma.staffRecoveryCode.count({ where: { userId: id } })).toBe(10);

    revoke(email, 'LIBRARIAN', '--yes');
    expect(await prisma.staffMfa.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.staffRecoveryCode.count({ where: { userId: id } })).toBe(0);
    expect(await tokens(id)).toHaveLength(0);
  }, 60_000);
});
