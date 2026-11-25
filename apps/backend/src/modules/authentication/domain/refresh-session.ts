export type SessionRevocationReason =
    | 'account_deletion'
    | 'disabled_user'
    | 'logout'
    | 'logout_all'
    | 'password_change'
    | 'password_reset'
    | 'refresh_replay';
