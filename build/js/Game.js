// ECS
import { Component, System, Types } from '../_snowpack/pkg/ecsy.js';
import { ECSYThreeWorld } from '../_snowpack/pkg/ecsy-three.js';
import { Egg, ControllableBasket, Moving, Hearts } from './Components.js';
import { BasketMoveSystem, MoveSystem, EggCollisionSystem } from './Systems.js';

// THREE
import * as THREE from '../_snowpack/pkg/three.js';
import { OrbitControls } from '../_snowpack/pkg/three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../_snowpack/pkg/three/examples/jsm/loaders/GLTFLoader.js';

// Utility
import Stats from '../_snowpack/pkg/three/examples/jsm/libs/stats.module.js';
import { GUI } from '../_snowpack/pkg/three/examples/jsm/libs/dat.gui.module.js';


class Game {

    /**
     * 
     * @param { DOMElement } canvas - <canvas> element to render to
     */

    constructor( canvas ) {

        let self = this;
        this.canvas = canvas;

        this._settings = {

            debug: false,
            shadows: {
                ON: true,
                shadowmapSize: 1024
            },
            displaySize: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            game: {
                playerSpeed: 10,
                startingHearts: 6,
                boundries: {
                    minX: -4.5,
                    maxX: 4,
                    minY: 5,
                    maxY: 7,
                },
                eggs: {
                    'white': 1,
                    'orange': 2,
                    'pink': 3,
                    'blue': 4,
                    'purple': 5,
                    'red': 6,
                    'green': 7,
                    'brown': 8,
                    'silver': 9,
                    'gold': 10,
                    'black': -100
                },
                startingEggVelocity: 1,
                eggVelocityAcceleration: 0.05
            }
        };

        this._playing = false;
        this._basket = null;
        this._heartsContaine = null;
        this._eggs = [];
        
        // ECS  
        this._world = new ECSYThreeWorld({ entityPoolSize: 100 });
        this._world
            .registerComponent( Egg )
            .registerComponent( ControllableBasket )
            .registerComponent( Hearts )
            .registerComponent( Moving );
        this._world
            .registerSystem( BasketMoveSystem )
            .registerSystem( MoveSystem )
            .registerSystem( EggCollisionSystem );
        
        if ( this._settings.debug ) {
            //Stats
            this._stats = new Stats();
            document.body.appendChild( this._stats.dom );

            //GUI
            this._gui = new GUI();
        }

        // Renderer
        this._renderer = new THREE.WebGLRenderer({ 
            canvas: canvas,
            antialias: true,
            powerPreference: "high-performance"
        });
        this._renderer.setSize( this._settings.displaySize.width, this._settings.displaySize.height );
        if ( this._settings.shadows.ON ) { 
            this._renderer.shadowMap.enabled = true;
            this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        this._renderer.outputEncoding = THREE.sRGBEncoding;
        this._renderer.physicallyCorrectLights = true;
        this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this._renderer.toneMappingExposure = 2.0;

        if ( this._settings.debug ) this._gui.add( this._renderer, 'toneMappingExposure', 0.0, 3.0, 0.05 );

        // Scene
        this._scene = this._world
            .createEntity()
            .addObject3DComponent( new THREE.Scene() ); // scene is the root Object3d and has no parent
        this._scene.getObject3D().background = new THREE.Color( 0xEDFCFF );

        // Camera
        this._camera = new THREE.PerspectiveCamera( 35, window.innerWidth / window.innerHeight, 0.1, 1000 );
        // this._camera.position.set( 0, 3.5, 13 );
        this._camera.position.set( 0, 3.5, 11 );

        // Clock
        this._clock = new THREE.Clock();

        // Loaders
        this._textureLoader = new THREE.TextureLoader();
        this._gltfLoader = new GLTFLoader();
        this.loaded = false;

        this._models = {};

        // Resize Event
        window.addEventListener("resize", () => this._onWindowResize(), false);

        THREE.DefaultLoadingManager.onLoad = () => {
            console.log( 'Loading Complete!');
            this.loaded = true;
            this._addModels();
        };

        // Inits
        this._loadModels();
        this._initControls();
        this._initLights();

        this._animate();

        // Debug
        // setInterval( () => {
        //     console.log( 'Draw calls:', this._renderer.info.render.calls );
        // }, 1000/2 );

        // document.addEventListener('keydown', ( evt ) => {
        //     if (evt.key === 'l') {
        //         console.log( this._camera.position );
        //     } else {
        //         console.log( evt );
        //     }
        // })
    }

    getScore() {

        return this._basket.getComponent( ControllableBasket ).score;
    }

    start() {

        if ( this.loaded ) {
            this._playing = true;
            this._clock.start();
            this._basket.getMutableComponent( ControllableBasket ).score = 0;
            this._basket.getMutableComponent( ControllableBasket ).lives = this._settings.game.startingHearts;
            this._fillHeartsContainer();
            this._resetEggsPositions();
        } else {
            console.warn('Models not loaded yet!');
        }
    }

    stop() {
        this._playing = false;
        this._clock.stop();
    }

    _loadModels() {

        const ext = '.gltf';
        const path = 'models/';
        const urls = [
            'chmurka1',
            'chmurka2',
            'chmurka3',
            'drzewo',
            'heart',
            'jajko',
            'koszyczek',
            'krolik',
            'krzaczek1',
            'krzaczek2',
            'krzaczek3',
            'krzaczek4',
            'trawa',
        ];

        const loadAndAssign = ( url ) => {
            this._gltfLoader.load( path + url + ext, ( gltf ) => {
                gltf.scene.traverse( ( child ) => {
                    if ( this._settings.shadows.ON && child.isMesh ) {
                        child.receiveShadow = child.castShadow = true;
                    }
                });
                this._models[ url ] =  gltf.scene;
            });
        }

        urls.forEach( ( url ) => {
            this._gltfLoader.load( path + url + ext, ( gltf ) => {
                gltf.scene.traverse( ( child ) => {
                    if ( this._settings.shadows.ON && child.isMesh ) {
                        child.receiveShadow = child.castShadow = true;
                    }
                });
                this._models[ url ] =  gltf.scene;
            });
        });
    }

    _addModels() {

        // console.log( 'this._models', this._models );

        for ( let key in this._models ) {

            const model = this._models[ key ];
            

            if ( key.includes('koszyczek') ) {

                const entity = this._world.createEntity().addObject3DComponent( model, this._scene );
                entity.addComponent( ControllableBasket, {
                    speed: this._settings.game.playerSpeed,
                    input: {
                        left: false,
                        right: false
                    },
                    boundries: {
                        minX: this._settings.game.boundries.minX,
                        maxX: this._settings.game.boundries.maxX
                    },
                    score: 0,
                    lives: this._settings.game.startingHearts
                });
                this._basket = entity;
                entity.getObject3D().position.set( 0, 1.35, 0.0 );

            } else if ( key.includes('heart') ) {

                this._heartsContainer = this._world.createEntity().addObject3DComponent( new THREE.Object3D(), this._scene );
                this._heartsContainer.addComponent( Hearts );
                // this._heartsContainer.getObject3D().position.set( -4, 4.7, 0 );
                this._heartsContainer.getObject3D().position.set( -5, 4.7, 0 );

            } else if ( key.includes('jajko') ) {

                for ( let key in this._settings.game.eggs ) {
                    const eggEntity = this._world.createEntity().addObject3DComponent( model.children[0].clone(), this._scene );

                    eggEntity.addComponent( Moving, {
                        direction: new THREE.Vector3( 0, -1, 0 ),
                        velocity: this._settings.game.startingEggVelocity,
                        acceleration: this._settings.game.eggVelocityAcceleration,
                        boundries: { min: new THREE.Vector3( this._settings.game.boundries.minX, 0, -1 ), max: new THREE.Vector3( this._settings.game.boundries.maxX, 10, 1 ) }, // 10
                        respawnRange: 60,
                    } );
                    eggEntity.addComponent( Egg, { points: this._settings.game.eggs[ key ] } );

                    eggEntity.getObject3D().material = model.children[0].material.clone();
                    eggEntity.getObject3D().material.color.set( key );

                    this._eggs.push( eggEntity );
                }

            } else {

                const entity = this._world.createEntity().addObject3DComponent( model, this._scene );
            }
        }

        this._resetEggsPositions();
    }

    _fillHeartsContainer() {

        const model = this._models['heart'];

        for ( let i = 0; i < this._settings.game.startingHearts; i++ ) {
            const heart =  this._world.createEntity().addObject3DComponent( model.clone(), this._heartsContainer );
            const heartOffset = 0.5;
            const heartScale = 0.2;
            heart.getObject3D().position.x = ( i - this._settings.game.startingHearts / 2 ) * heartOffset;
            heart.getObject3D().scale.multiplyScalar( heartScale );
        }
    }

    _resetEggsPositions() {

        this._eggs.forEach( ( eggEntity ) => {
            const movingComponent = eggEntity.getComponent( Moving );

            eggEntity.getObject3D().position.set(
                movingComponent.boundries.min.x + (movingComponent.boundries.max.x - movingComponent.boundries.min.x) * Math.random(),
                movingComponent.boundries.max.y + Math.random() * movingComponent.respawnRange,
                0
            );
        });
    }

    _initControls() {

        // this.controls2 = new OrbitControls( this._camera , this.canvas );

        this.controls = {
            left: false,
            right: false
        };

        const onKeyDown = ( evt ) => {
            evt.preventDefault();
            changeKeyState( evt.code, true );
        }
        const onKeyUp = ( evt ) => {
            evt.preventDefault();
            changeKeyState( evt.code, false );
        }

        const changeKeyState = ( keyCode, trueOrFalse ) => {

            const controlComponent = this._basket.getComponent( ControllableBasket );

            switch( keyCode ) {
                case 'ArrowLeft':
                    this.controls.left = trueOrFalse;
                    controlComponent.input.left = trueOrFalse;
                    break;
                case 'ArrowRight':
                    this.controls.right = trueOrFalse;
                    controlComponent.input.right = trueOrFalse;
                    break;
            }
        }

        document.addEventListener( 'keydown', onKeyDown, false );
        document.addEventListener( 'keyup', onKeyUp, false );
    }

    _initLights() {
        
        let lights = [];

        lights[0] = new THREE.AmbientLight( 0xffffff , 0.5 );
        lights[1] = new THREE.DirectionalLight( 0xffffff , 1.5 );
        lights[1].position.set( 3 , 15 , 20 );
        if ( this._settings.shadows.ON ) {
            lights[1].castShadow = true;
            lights[1].shadow.mapSize.width = this._settings.shadows.shadowmapSize;
            lights[1].shadow.mapSize.height = this._settings.shadows.shadowmapSize;
            lights[1].shadow.camera.near = 0.1;
            lights[1].shadow.camera.far = 50;
            if( lights[1] instanceof THREE.DirectionalLight ){
                lights[1].shadow.camera.left = -30;
                lights[1].shadow.camera.bottom = -30;
                lights[1].shadow.camera.top = 30;
                lights[1].shadow.camera.right = 30;
            }
            lights[1].shadow.bias = -0.005;
        }

        if ( this._settings.debug ) {
            this._gui.add( lights[0], 'intensity', 0.0, 4.0, 0.1 );
            this._gui.add( lights[1], 'intensity', 0.0, 5.0, 0.1 );
        }

        for( let i = 0; i < lights.length; i++ ){
            let light = this._world.createEntity().addObject3DComponent( lights[i], this._scene );
        }
    }

    _animate() {

        if ( this._settings.debug ) this._stats.begin();
        const delta = this._clock.getDelta();
        const elapsedTime = this._clock.elapsedTime;

        if ( this._playing ) {
            this._world.execute( delta, elapsedTime );
        }
        
        this._renderer.render( this._scene.getObject3D(), this._camera );

        requestAnimationFrame( this._animate.bind( this ) );
        if ( this._settings.debug ) this._stats.end();
    }

    _onWindowResize() {

        this._settings.displaySize.width = window.innerWidth;
        this._settings.displaySize.height = window.innerHeight;

        this._renderer.setSize( this._settings.displaySize.width, this._settings.displaySize.height );
        this._camera.aspect = this._settings.displaySize.width / this._settings.displaySize.height;
        this._camera.updateProjectionMatrix();
    }
}

export { Game };