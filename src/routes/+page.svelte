<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- the build stamp links to an external GitHub commit, not an app route */
	import { resolve } from '$app/paths';
	import { debug } from '#lib/ui/debug.svelte';
	import { formatDateTime, t } from '#lib/i18n/index.svelte';

	const buildLabel = import.meta.env.VITE_BUILD_LABEL;
	const buildNumber = import.meta.env.VITE_BUILD_NUMBER;
	const buildAt = import.meta.env.VITE_BUILD_AT;
	const repo = import.meta.env.VITE_REPO;
	const sha = import.meta.env.VITE_BUILD_SHA;

	const buildDate = $derived(buildAt ? formatDateTime(buildAt) : '');
	const shortSha = $derived(sha ? sha.slice(0, 7) : '');
	const commitUrl = $derived(sha && repo ? `https://github.com/${repo}/commit/${sha}` : undefined);
</script>

<svelte:head>
	<title>{t('landing.title')}</title>
</svelte:head>

<div class="page">
	<h1>KrimiMap</h1>
	<p class="muted">{t('landing.intro')}</p>

	<div class="row">
		<a href={resolve('editor/')}><button class="primary">{t('landing.open')}</button></a>
	</div>

	<div class="panel">
		<h2>{t('landing.works.title')}</h2>
		<ul>
			<li>{t('landing.works.map')}</li>
			<li>{t('landing.works.offline')}</li>
			<li>{t('landing.works.cases')}</li>
		</ul>
	</div>

	{#if debug()}
		<div class="panel debug-panel" data-testid="debug-panel">
			<h2>{t('landing.debug.title')}</h2>
			<ul>
				<li>{t('landing.debug.static')}</li>
				<li>{t('landing.debug.controller')}</li>
				<li><a href={resolve('spike/webllm/')}>{t('landing.debug.spike')}</a></li>
				<li>{t('landing.debug.webgpu')}</li>
			</ul>
			{#if buildLabel}
				<p class="small muted" data-testid="build-info">
					{t('landing.debug.build')}: {buildLabel}{#if buildNumber}
						· #{buildNumber}{/if}{#if buildDate}
						· {buildDate}{/if}{#if commitUrl}
						·
						<a href={commitUrl} target="_blank" rel="noreferrer"><code>{shortSha}</code></a>{/if}
				</p>
			{/if}
		</div>
	{/if}
</div>
