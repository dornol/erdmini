import { base } from '$app/paths';

export function appPath(path = '/'): string {
	const normalized = path.startsWith('/') ? path : `/${path}`;
	return `${base}${normalized}` || '/';
}

export function cookiePath(): string {
	return base || '/';
}

export function routePath(pathname: string): string {
	if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
		return pathname.slice(base.length) || '/';
	}
	return pathname;
}
