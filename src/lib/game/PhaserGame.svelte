<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Phaser from 'phaser';
	import MainScene from './MainScene';

	let game: Phaser.Game | null = null;
	let container: HTMLDivElement;

	onMount(() => {
		const config: Phaser.Types.Core.GameConfig = {
			type: Phaser.AUTO,
			parent: container,
			width: 1200,
			height: 800,
			backgroundColor: '#2c2c2c',
			scene: [MainScene],
			physics: {
				default: 'arcade',
				arcade: { debug: false }
			}
		};

		game = new Phaser.Game(config);
	});

	onDestroy(() => {
		if (game) {
			game.destroy(true);
		}
	});
</script>

<div bind:this={container} style="width: 100%; height: 100%;"></div>