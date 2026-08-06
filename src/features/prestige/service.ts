import { prestigeUserIfEligible } from '../../infrastructure/database/service';
import type { Queryable } from '../../infrastructure/database/types';
import type { User } from '../activities/types';
import { MAX_LVL } from '../activities/constants';

export function canPrestige(user: User): boolean {
    return user.level >= MAX_LVL;
}

export function prestigeUser(user: User, db?: Queryable): Promise<User | null> {
    return prestigeUserIfEligible(user.id, MAX_LVL, db);
}
