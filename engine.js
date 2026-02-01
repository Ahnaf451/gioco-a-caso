"use strict";

const canvas = document.getElementById('gameCanvas');
const gl = canvas.getContext('webgl');

if (!gl) alert("WebGL non supportato");

// --- SHADERS ---
const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec3 aNormal;
    uniform mat4 uNormalMatrix;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    varying highp vec3 vLighting;
    void main() {
        gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
        highp vec3 ambientLight = vec3(0.3, 0.3, 0.3);
        highp vec3 directionalLightColor = vec3(1, 1, 0.9);
        highp vec3 directionalVector = normalize(vec3(0.85, 0.8, 0.75));
        highp vec4 transformedNormal = uNormalMatrix * vec4(aNormal, 1.0);
        highp float directional = max(dot(transformedNormal.xyz, directionalVector), 0.0);
        vLighting = ambientLight + (directionalLightColor * directional);
    }
`;

const fsSource = `
    varying highp vec3 vLighting;
    void main() {
        gl_FragColor = vec4(vec3(0.5, 0.7, 1.0) * vLighting, 1.0);
    }
`;

// --- GAME STATE ---
const Game = {
    player: {
        pos: [0, 1, 5],
        rot: [0, 0, 0],
        hp: 100,
        stamina: 100,
        speed: 0.1,
        isRunning: false
    },
    input: {},
    camera: { distance: 10, pitch: 0.5, yaw: 0 },
    objects: []
};

// --- INIZIALIZZAZIONE ---
function init() {
    // Setup Canvas
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Inizializza Shaders
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
            normal: gl.getAttribLocation(shaderProgram, 'aNormal'),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
            modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
            normalMatrix: gl.getUniformLocation(shaderProgram, 'uNormalMatrix'),
        },
    };

    const buffers = initBuffers(gl);
    
    // Eventi Input
    window.addEventListener('keydown', e => Game.input[e.code] = true);
    window.addEventListener('keyup', e => Game.input[e.code] = false);
    window.addEventListener('mousemove', e => {
        if(document.pointerLockElement === canvas) {
            Game.camera.yaw += e.movementX * 0.005;
            Game.camera.pitch += e.movementY * 0.005;
        }
    });
    
    canvas.onclick = () => canvas.requestPointerLock();

    // Game Loop
    function render(now) {
        update();
        drawScene(gl, programInfo, buffers);
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

// --- LOGICA DI MOVIMENTO ---
function update() {
    const p = Game.player;
    
    // Gestione Corsa e Stamina
    p.isRunning = Game.input['ShiftLeft'] && p.stamina > 0;
    const currentSpeed = p.isRunning ? p.speed * 2 : p.speed;
    if(p.isRunning) p.stamina -= 0.5;
    else if(p.stamina < 100) p.stamina += 0.2;

    // Movimento relativo alla camera
    if (Game.input['KeyW']) {
        p.pos[0] -= Math.sin(Game.camera.yaw) * currentSpeed;
        p.pos[2] -= Math.cos(Game.camera.yaw) * currentSpeed;
    }
    if (Game.input['KeyS']) {
        p.pos[0] += Math.sin(Game.camera.yaw) * currentSpeed;
        p.pos[2] += Math.cos(Game.camera.yaw) * currentSpeed;
    }

    // Update HUD
    document.getElementById('hp-bar').style.width = p.hp + "%";
    document.getElementById('stamina-bar').style.width = p.stamina + "%";
}

// --- WEBGL RENDERING FUNCS ---
function drawScene(gl, programInfo, buffers) {
    gl.clearColor(0.1, 0.1, 0.15, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, 45 * Math.PI / 180, gl.canvas.clientWidth / gl.canvas.clientHeight, 0.1, 100.0);

    const modelViewMatrix = mat4.create();
    
    // Camera Orbitale
    const camX = Game.player.pos[0] + Game.camera.distance * Math.sin(Game.camera.yaw) * Math.cos(Game.camera.pitch);
    const camY = Game.player.pos[1] + Game.camera.distance * Math.sin(Game.camera.pitch);
    const camZ = Game.player.pos[2] + Game.camera.distance * Math.cos(Game.camera.yaw) * Math.cos(Game.camera.pitch);

    mat4.lookAt(modelViewMatrix, [camX, camY, camZ], Game.player.pos, [0, 1, 0]);

    // Disegna Pavimento (Piano)
    drawObject(gl, programInfo, buffers, [0, 0, 0], [50, 0.1, 50], modelViewMatrix, projectionMatrix);
    
    // Disegna Giocatore (Cubo)
    drawObject(gl, programInfo, buffers, Game.player.pos, [0.5, 1, 0.5], modelViewMatrix, projectionMatrix);
}

function drawObject(gl, programInfo, buffers, pos, scale, viewMat, projMat) {
    const modelMat = mat4.create();
    mat4.translate(modelMat, viewMat, pos);
    mat4.scale(modelMat, modelMat, scale);

    const normalMatrix = mat4.create();
    mat4.invert(normalMatrix, modelMat);
    mat4.transpose(normalMatrix, normalMatrix);

    gl.useProgram(programInfo.program);
    gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projMat);
    gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelMat);
    gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
    gl.vertexAttribPointer(programInfo.attribLocations.normal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.normal);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
}

// --- UTILS (BUFFER & SHADERS) ---
function initBuffers(gl) {
    const positions = [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1, -1, -1, 1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1];
    const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0];
    const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23];
    
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const normBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    return { position: posBuffer, normal: normBuffer, indices: indexBuffer };
}

function initShaderProgram(gl, vs, fs) {
    const vShader = loadShader(gl, gl.VERTEX_SHADER, vs);
    const fShader = loadShader(gl, gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, vShader);
    gl.attachShader(prog, fShader);
    gl.linkProgram(prog);
    return prog;
}

function loadShader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
}

window.onload = init;
