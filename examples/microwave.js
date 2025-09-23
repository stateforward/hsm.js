#!/usr/bin/env node
const hsm = require('../src/hsm.js');
const blessed = require('blessed');

// Microwave Instance class
class Microwave extends hsm.Instance {
    constructor() {
        super();
        this.time = 0;
        this.power = 50; // Default 50% power
        this.doorOpen = false;
        this.lightOn = false;
        this.heating = false;
        this.displayMessage = '';
        this.timerInterval = null;
    }

    setTime(seconds) {
        this.time = seconds;
    }

    addTime(seconds) {
        this.time += seconds;
        if (this.time > 5999) this.time = 5999; // Max 99:59
    }

    setPower(level) {
        this.power = Math.max(10, Math.min(100, level));
    }

    getTimeDisplay() {
        const minutes = Math.floor(this.time / 60);
        const seconds = this.time % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Private static methods for state machine behaviors
    static #onIdleEntry(ctx, inst, event) {
        inst.displayMessage = 'Ready';
        inst.lightOn = false;
        inst.heating = false;
    }

    static #canSetTime(ctx, inst, event) {
        return event.data.seconds > 0;
    }

    static #setTimeEffect(ctx, inst, event) {
        inst.setTime(event.data.seconds);
    }

    static #addThirtySecondsEffect(ctx, inst, event) {
        inst.addTime(30);
    }

    static #setPowerEffect(ctx, inst, event) {
        inst.setPower(event.data.level);
    }

    static #onDoorOpenEntry(ctx, inst, event) {
        inst.doorOpen = true;
        inst.lightOn = true;
        inst.displayMessage = 'Door Open';
    }

    static #onDoorOpenExit(ctx, inst, event) {
        inst.doorOpen = false;
    }

    static #onReadyEntry(ctx, inst, event) {
        inst.displayMessage = 'Press Start';
    }

    static #clearTimeEffect(ctx, inst, event) {
        inst.time = 0;
    }

    static #onCookingEntry(ctx, inst, event) {
        inst.lightOn = true;
        inst.heating = true;
        inst.displayMessage = 'Cooking';
    }

    static #onCookingExit(ctx, inst, event) {
        inst.heating = false;
    }

    static #cookingActivity(ctx, inst, event) {
        return new Promise(function (resolve) {
            inst.timerInterval = setInterval(async function () {
                if (ctx.done) {
                    clearInterval(inst.timerInterval);
                    resolve();
                    return;
                }

                inst.time--;
                if (inst.time <= 0) {
                    clearInterval(inst.timerInterval);
                    inst.dispatch({ name: 'timer_complete' });
                    resolve();
                }
            }, 1000);

            ctx.addEventListener('done', function () {
                clearInterval(inst.timerInterval);
                resolve();
            });
        });
    }

    static #onPausedEntry(ctx, inst, event) {
        inst.displayMessage = 'Paused';
        inst.lightOn = true;
        inst.doorOpen = true;
    }

    static #onPausedExit(ctx, inst, event) {
        inst.doorOpen = false;
    }

    static #onPausedReadyEntry(ctx, inst, event) {
        inst.displayMessage = 'Press Start to Resume';
    }

    static #onCompleteEntry(ctx, inst, event) {
        inst.displayMessage = 'Complete!';
        inst.heating = false;
    }

    static #completeBeepActivity(ctx, inst, event) {
        // Beep 3 times
        let beepCount = 0;
        return new Promise(function (resolve) {
            const beepInterval = setInterval(function () {
                if (ctx.done || beepCount >= 3) {
                    clearInterval(beepInterval);
                    resolve();
                    return;
                }
                inst.displayMessage = beepCount % 2 === 0 ? 'BEEP!' : 'Complete!';
                beepCount++;
            }, 500);

            ctx.addEventListener('done', function () {
                clearInterval(beepInterval);
                resolve();
            });
        });
    }

    static #getCompleteTimeout(ctx, inst, event) {
        return 3000;
    }

    static model = hsm.define('Microwave',
        hsm.initial(hsm.target('idle')),

        hsm.state('idle',
            hsm.entry(Microwave.#onIdleEntry),
            hsm.transition(
                hsm.on('door_open'),
                hsm.target('../doorOpen')
            ),
            hsm.transition(
                hsm.on('time_set'),
                hsm.guard(Microwave.#canSetTime),
                hsm.target('../ready'),
                hsm.effect(Microwave.#setTimeEffect)
            ),
            hsm.transition(
                hsm.on('add_30s'),
                hsm.target('../cooking'),
                hsm.effect(Microwave.#addThirtySecondsEffect)
            ),
            hsm.transition(
                hsm.on('power_set'),
                hsm.effect(Microwave.#setPowerEffect)
            )
        ),

        hsm.state('doorOpen',
            hsm.entry(Microwave.#onDoorOpenEntry),
            hsm.exit(Microwave.#onDoorOpenExit),
            hsm.transition(
                hsm.on('door_close'),
                hsm.target('../idle')
            )
        ),

        hsm.state('ready',
            hsm.entry(Microwave.#onReadyEntry),
            hsm.transition(
                hsm.on('start'),
                hsm.target('../cooking')
            ),
            hsm.transition(
                hsm.on('clear'),
                hsm.target('../idle'),
                hsm.effect(Microwave.#clearTimeEffect)
            ),
            hsm.transition(
                hsm.on('door_open'),
                hsm.target('../doorOpen')
            ),
            hsm.transition(
                hsm.on('power_set'),
                hsm.effect(Microwave.#setPowerEffect)
            ),
            hsm.transition(
                hsm.on('add_30s'),
                hsm.effect(Microwave.#addThirtySecondsEffect)
            )
        ),

        hsm.state('cooking',
            hsm.entry(Microwave.#onCookingEntry),
            hsm.exit(Microwave.#onCookingExit),
            hsm.activity(Microwave.#cookingActivity),
            hsm.transition(
                hsm.on('door_open'),
                hsm.target('../paused')
            ),
            hsm.transition(
                hsm.on('stop'),
                hsm.target('../idle'),
                hsm.effect(Microwave.#clearTimeEffect)
            ),
            hsm.transition(
                hsm.on('add_30s'),
                hsm.effect(Microwave.#addThirtySecondsEffect)
            ),
            hsm.transition(
                hsm.on('timer_complete'),
                hsm.target('../complete')
            )
        ),

        hsm.state('paused',
            hsm.entry(Microwave.#onPausedEntry),
            hsm.exit(Microwave.#onPausedExit),
            hsm.transition(
                hsm.on('door_close'),
                hsm.target('../pausedReady')
            ),
            hsm.transition(
                hsm.on('clear'),
                hsm.target('../idle'),
                hsm.effect(Microwave.#clearTimeEffect)
            ),
            hsm.transition(
                hsm.on('power_set'),
                hsm.effect(Microwave.#setPowerEffect)
            )
        ),

        hsm.state('pausedReady',
            hsm.entry(Microwave.#onPausedReadyEntry),
            hsm.transition(
                hsm.on('start'),
                hsm.target('../cooking')
            ),
            hsm.transition(
                hsm.on('clear'),
                hsm.target('../idle'),
                hsm.effect(Microwave.#clearTimeEffect)
            ),
            hsm.transition(
                hsm.on('door_open'),
                hsm.target('../paused')
            ),
            hsm.transition(
                hsm.on('power_set'),
                hsm.effect(Microwave.#setPowerEffect)
            )
        ),

        hsm.state('complete',
            hsm.entry(Microwave.#onCompleteEntry),
            hsm.activity(Microwave.#completeBeepActivity),
            hsm.transition(
                hsm.on('door_open'),
                hsm.target('../doorOpen')
            ),
            hsm.transition(
                hsm.on('clear'),
                hsm.target('../idle'),
                hsm.effect(Microwave.#clearTimeEffect)
            ),
            hsm.transition(
                hsm.after(Microwave.#getCompleteTimeout),
                hsm.target('../idle'),
                hsm.effect(Microwave.#clearTimeEffect)
            )
        )
    );
}



// Create blessed UI
const screen = blessed.screen({
    smartCSR: true,
    title: 'Microwave Simulator'
});

// Main display box
const displayBox = blessed.box({
    top: 0,
    left: 0,
    width: '50%',
    height: '60%',
    content: '{center}🍕 Microwave Simulator{/center}',
    tags: true,
    border: {
        type: 'line'
    },
    style: {
        fg: 'white',
        border: {
            fg: '#f0f0f0'
        }
    }
});

// Status display
const statusBox = blessed.text({
    parent: displayBox,
    top: 2,
    left: 2,
    width: '90%',
    height: 'shrink',
    tags: true,
    style: {
        fg: 'white'
    }
});

// Controls box
const controlsBox = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: '40%',
    content: '{bold}Controls:{/bold}\n' +
        '[d] Open/Close Door    [s] Start         [x] Stop\n' +
        '[c] Clear              [+] Add 30s       [q] Quit\n' +
        '[1] 1 min   [2] 2 min   [3] 3 min\n' +
        '[-/=] Decrease/Increase Power',
    tags: true,
    border: {
        type: 'line'
    },
    style: {
        fg: 'white',
        border: {
            fg: '#f0f0f0'
        }
    }
});

// State display box
const stateBox = blessed.box({
    top: 0,
    right: 0,
    width: '50%',
    height: '60%',
    content: '{center}State Information{/center}',
    tags: true,
    border: {
        type: 'line'
    },
    style: {
        fg: 'white',
        border: {
            fg: '#f0f0f0'
        }
    }
});

// Add boxes to screen
screen.append(displayBox);
screen.append(controlsBox);
screen.append(stateBox);

// Create microwave instance and start state machine
const microwave = new Microwave();
const ctx = new hsm.Context();
const sm = hsm.start(ctx, microwave, Microwave.model);

// Update display function
function updateDisplay() {
    const currentState = microwave.state().split('/').pop();

    const doorColor = microwave.doorOpen ? '{red-fg}' : '{green-fg}';
    const lightColor = microwave.lightOn ? '{yellow-fg}' : '{gray-fg}';
    const heatingColor = microwave.heating ? '{red-fg}' : '{gray-fg}';

    statusBox.setContent(
        `Time: {green-fg}{bold}${microwave.getTimeDisplay()}{/bold}{/green-fg}  ` +
        `Power: {yellow-fg}{bold}${microwave.power}%{/bold}{/yellow-fg}\n\n` +
        `Status: {cyan-fg}{bold}${microwave.displayMessage}{/bold}{/cyan-fg}\n\n` +
        `Door: ${doorColor}${microwave.doorOpen ? 'OPEN' : 'CLOSED'}{/}\n` +
        `Light: ${lightColor}${microwave.lightOn ? '💡 ON' : '⚫ OFF'}{/}\n` +
        `Heating: ${heatingColor}${microwave.heating ? '🔥 ON' : '⚫ OFF'}{/}`
    );

    stateBox.setContent(
        '{center}State Information{/center}\n\n' +
        `Current State: {bold}${currentState}{/bold}\n` +
        `Full Path: {gray-fg}${microwave.state()}{/gray-fg}`
    );

    screen.render();
}

// Update display every 100ms
const updateInterval = setInterval(updateDisplay, 100);

// Key bindings
screen.key(['q', 'C-c'], function () {
    clearInterval(updateInterval);
    ctx.done = true;
    // Notify all listeners
    ctx.listeners.forEach(listener => listener());
    return process.exit(0);
});

screen.key('d', function () {
    if (microwave.doorOpen) {
        microwave.dispatch({ name: 'door_close' });
    } else {
        microwave.dispatch({ name: 'door_open' });
    }
});

screen.key('s', function () {
    microwave.dispatch({ name: 'start' });
});

screen.key('c', function () {
    microwave.dispatch({ name: 'clear' });
});

screen.key('x', function () {
    microwave.dispatch({ name: 'stop' });
});

screen.key('+', function () {
    microwave.dispatch({ name: 'add_30s' });
});

screen.key('1', function () {
    microwave.dispatch({ name: 'time_set', data: { seconds: 60 } });
});

screen.key('2', function () {
    microwave.dispatch({ name: 'time_set', data: { seconds: 120 } });
});

screen.key('3', function () {
    microwave.dispatch({ name: 'time_set', data: { seconds: 180 } });
});

screen.key('-', function () {
    microwave.dispatch({ name: 'power_set', data: { level: microwave.power - 10 } });
});

screen.key('=', function () {
    microwave.dispatch({ name: 'power_set', data: { level: microwave.power + 10 } });
});

// Initial render
updateDisplay();
screen.render();