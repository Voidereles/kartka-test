import { System } from '../_snowpack/pkg/ecsy.js';
import { ControllableBasket, Moving, Egg, Hearts } from './Components.js';
import * as THREE from '../_snowpack/pkg/three.js';

class BasketMoveSystem extends System {
    init() {}
    execute( delta, time ) {

        this.queries.playerBaskets.results.forEach( ( entity ) => {

            const basket = entity.getObject3D();
            const controlComponent = entity.getComponent( ControllableBasket );

            const leftMoveX = basket.position.x - controlComponent.speed * delta;
            const righttMoveX = basket.position.x + controlComponent.speed * delta;

            if ( controlComponent.input.left && leftMoveX >= controlComponent.boundries.minX ) {
                basket.position.x = leftMoveX;
            }
            if ( controlComponent.input.right && righttMoveX <= controlComponent.boundries.maxX ) {
                basket.position.x = righttMoveX;
            }
        });
    }
}
BasketMoveSystem.queries = {
    playerBaskets: { components: [ ControllableBasket ] }
};

class MoveSystem extends System {
    init() {
        this.vec3 = new THREE.Vector3()
    }
    execute( delta, time ) {

        let basketEntity, heartsEntity;

        this.queries.playerBaskets.results.forEach( ( entity ) => {
            basketEntity = entity;
        });

        this.queries.hearts.results.forEach( ( entity ) => {
            heartsEntity = entity;
        });

        this.queries.movingObjects.results.forEach( ( entity ) => {

            const obj = entity.getObject3D();
            const movingComponent = entity.getComponent( Moving );
            const controlComponent = basketEntity.getMutableComponent( ControllableBasket );

            const velocity = ( movingComponent.velocity + movingComponent.acceleration * time ) * delta;
            // console.log( velocity );
            obj.position.add( this.vec3.copy( movingComponent.direction ).multiplyScalar( velocity ) );

            if ( obj.position.y < movingComponent.boundries.min.y ) {
                obj.position.set( // Reset egg
                    movingComponent.boundries.min.x + (movingComponent.boundries.max.x - movingComponent.boundries.min.x) * Math.random(),
                    movingComponent.boundries.max.y + Math.random() * (movingComponent.respawnRange + time),
                    0
                );
                // Remove a heart
                if ( entity.getComponent( Egg ).points >= 0 ) {
                    // remove life and heart
                    controlComponent.lives--;
                    const heartsContainer = heartsEntity.getObject3D();
                    heartsContainer.remove( heartsContainer.children[ heartsContainer.children.length - 1 ] );

                    if ( controlComponent.lives <= 0 ) { // check for game over
                        document.dispatchEvent( new Event('Game Over') );
                    }
                }
            }
        });
    }
}
MoveSystem.queries = {
    movingObjects: { components: [ Moving ] },
    playerBaskets: { components: [ ControllableBasket ] },
    hearts: { components: [ Hearts ] },
};

class EggCollisionSystem extends System {
    init() {}
    execute( delta, time ) {

        let basketEntity, heartsEntity;

        this.queries.playerBaskets.results.forEach( ( entity ) => {
            basketEntity = entity;
        });

        this.queries.hearts.results.forEach( ( entity ) => {
            heartsEntity = entity;
        });

        this.queries.eggs.results.forEach( ( entity ) => {

            const egg = entity.getObject3D();
            const basket = basketEntity.getObject3D();
            const controlComponent = basketEntity.getMutableComponent( ControllableBasket );
            const movingComponent = entity.getComponent( Moving );
            const eggComponent = entity.getComponent( Egg );

            if( egg.position.distanceTo( basket.position ) < 0.75 ) {
                egg.position.set(
                    movingComponent.boundries.min.x + (movingComponent.boundries.max.x - movingComponent.boundries.min.x) * Math.random(),
                    movingComponent.boundries.max.y + Math.random() * movingComponent.respawnRange,
                    0
                );

                controlComponent.score += eggComponent.points;

                document.getElementsByClassName('score')[0].textContent = 'Score: ' + controlComponent.score;

                if ( eggComponent.points < 0 ) { // black egg
                    controlComponent.lives--;
                    const heartsContainer = heartsEntity.getObject3D();
                    heartsContainer.remove( heartsContainer.children[ heartsContainer.children.length - 1 ] );
                }
            }
        });
    }
}
EggCollisionSystem.queries = {
    eggs: { components: [ Egg ] },
    playerBaskets: { components: [ ControllableBasket ] },
    hearts: { components: [ Hearts ] },
};

export { BasketMoveSystem, MoveSystem, EggCollisionSystem };