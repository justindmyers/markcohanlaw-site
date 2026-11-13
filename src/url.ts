// Prefix root-relative asset paths with the deploy base (needed for github.io/<repo>/ test deploys).
export const asset = (p: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + p;
