import Phaser from 'phaser';

export default class MainScene extends Phaser.Scene {
	constructor() {
		super({ key: 'MainScene' });
	}

	preload() {
		// Hier später Tilesets und Assets laden
		this.load.image('logo', 'https://picsum.photos/id/1015/200/200');
	}

	create() {
		this.cameras.main.setBackgroundColor('#1a1a2e');

		const logo = this.add.image(400, 300, 'logo').setInteractive();

		this.input.setDraggable(logo);

		logo.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
			logo.setPosition(dragX, dragY);
		});

		this.add.text(20, 20, 'KrimiMap - Prototyp\nDrag the image!', {
			fontSize: '24px',
			color: '#ffffff'
		});

		// Einfache Zoom/Pan Demo
		this.cameras.main.setZoom(1);
	}
}
