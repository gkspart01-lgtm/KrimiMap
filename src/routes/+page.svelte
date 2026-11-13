<script lang="ts">
	import { resolve } from '$app/paths';
	import { debug } from '#lib/ui/debug.svelte';
	import { t } from '#lib/i18n/index.svelte';

	const buildInfo = import.meta.env.VITE_BUILD_INFO;
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
			{#if buildInfo}
				<p class="small muted">
					{t('landing.debug.build')}: <code data-testid="build-info">{buildInfo}</code>
				</p>
			{/if}
		</div>
	{/if}
</div>
