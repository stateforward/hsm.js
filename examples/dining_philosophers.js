const hsm = require('../src/hsm.js');
const blessed = require('blessed');

// Constants
const NUM_PHILOSOPHERS = 5;
const THINKING_TIME = { min: 2000, max: 5000 };
const EATING_TIME = { min: 3000, max: 6000 };

// Fork class represents a shared resource
class Fork {
  constructor(id) {
    this.id = id;
    this.owner = null;
    this.requested = false;
  }

  tryAcquire(philosopherId) {
    if (this.owner === null) {
      this.owner = philosopherId;
      return true;
    }
    return false;
  }

  release(philosopherId) {
    if (this.owner === philosopherId) {
      this.owner = null;
      this.requested = false;
    }
  }

  isAvailable() {
    return this.owner === null;
  }

  request() {
    this.requested = true;
  }
}

// Philosopher Instance
class PhilosopherInstance extends hsm.Instance {
  constructor(id, leftFork, rightFork, screen, box, statsBox, tableBox) {
    super();
    this.id = id;
    this.name = `Philosopher ${id}`;
    this.leftFork = leftFork;
    this.rightFork = rightFork;
    this.screen = screen;
    this.box = box;
    this.statsBox = statsBox;
    this.tableBox = tableBox;
    this.state = 'thinking';
    this.hasLeftFork = false;
    this.hasRightFork = false;
    
    // Statistics
    this.stats = {
      thinkingTime: 0,
      waitingTime: 0,
      eatingTime: 0,
      thinkingCount: 0,
      eatingCount: 0,
      lastStateChange: Date.now()
    };
  }

  updateState(newState) {
    const now = Date.now();
    const duration = now - this.stats.lastStateChange;
    
    // Update time spent in previous state
    switch (this.state) {
      case 'thinking':
        this.stats.thinkingTime += duration;
        break;
      case 'waiting':
        this.stats.waitingTime += duration;
        break;
      case 'eating':
        this.stats.eatingTime += duration;
        break;
    }
    
    // Update counts
    if (newState === 'thinking') this.stats.thinkingCount++;
    if (newState === 'eating') this.stats.eatingCount++;
    
    this.state = newState;
    this.stats.lastStateChange = now;
    this.updateDisplay();
    this.updateTable();
  }

  updateDisplay() {
    const stateDisplay = {
      thinking: '{blue-fg}THINKING{/}',
      waiting: '{yellow-fg}WAITING{/}',
      eating: '{green-fg}EATING{/}'
    };

    const leftForkDisplay = this.hasLeftFork ? '🍴' : '  ';
    const rightForkDisplay = this.hasRightFork ? '🍴' : '  ';

    const content = `
{center}${this.name}{/center}

State: ${stateDisplay[this.state]}

${leftForkDisplay} [${this.id}] ${rightForkDisplay}

Left Fork: ${this.hasLeftFork ? 'YES' : 'NO'}
Right Fork: ${this.hasRightFork ? 'YES' : 'NO'}`;

    this.box.setContent(content);
    this.screen.render();
  }

  updateTable() {
    // Update the central table visualization
    if (this.tableBox) {
      this.tableBox.updatePhilosopher(this.id, this.state, this.hasLeftFork, this.hasRightFork);
    }
  }

  getRandomTime(timeRange) {
    return Math.floor(Math.random() * (timeRange.max - timeRange.min + 1)) + timeRange.min;
  }

  tryAcquireForks() {
    // Try to acquire both forks atomically to prevent deadlock
    // Using "resource hierarchy" solution - always acquire lower numbered fork first
    const firstFork = this.leftFork.id < this.rightFork.id ? this.leftFork : this.rightFork;
    const secondFork = this.leftFork.id < this.rightFork.id ? this.rightFork : this.leftFork;
    
    if (firstFork.tryAcquire(this.id)) {
      if (secondFork.tryAcquire(this.id)) {
        this.hasLeftFork = true;
        this.hasRightFork = true;
        this.updateDisplay();
        return true;
      } else {
        // Release first fork if we can't get both
        firstFork.release(this.id);
      }
    }
    
    // Request forks for next attempt
    this.leftFork.request();
    this.rightFork.request();
    return false;
  }

  releaseForks() {
    this.leftFork.release(this.id);
    this.rightFork.release(this.id);
    this.hasLeftFork = false;
    this.hasRightFork = false;
    this.updateDisplay();
  }

  updateStats() {
    const now = Date.now();
    const duration = now - this.stats.lastStateChange;
    
    switch (this.state) {
      case 'thinking':
        this.stats.thinkingTime += duration;
        break;
      case 'waiting':
        this.stats.waitingTime += duration;
        break;
      case 'eating':
        this.stats.eatingTime += duration;
        break;
    }
    
    this.stats.lastStateChange = now;
    
    if (this.statsBox) {
      this.statsBox.updateStats(this.id, this.stats);
    }
  }
}

// Table visualization box
class TableBox {
  constructor(box, screen) {
    this.box = box;
    this.screen = screen;
    this.philosophers = [];
    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
      this.philosophers.push({
        state: 'thinking',
        hasLeftFork: false,
        hasRightFork: false
      });
    }
  }

  updatePhilosopher(id, state, hasLeftFork, hasRightFork) {
    this.philosophers[id] = { state, hasLeftFork, hasRightFork };
    this.render();
  }

  render() {
    const radius = 8;
    const centerX = 15;
    const centerY = 10;
    
    let content = [];
    for (let y = 0; y < 20; y++) {
      content[y] = new Array(30).fill(' ');
    }
    
    // Draw table (circle)
    for (let angle = 0; angle < 360; angle += 5) {
      const rad = angle * Math.PI / 180;
      const x = Math.round(centerX + radius * Math.cos(rad));
      const y = Math.round(centerY + radius * Math.sin(rad));
      if (x >= 0 && x < 30 && y >= 0 && y < 20) {
        content[y][x] = '○';
      }
    }
    
    // Draw philosophers and forks
    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
      const angle = (i * 360 / NUM_PHILOSOPHERS - 90) * Math.PI / 180;
      const x = Math.round(centerX + (radius + 3) * Math.cos(angle));
      const y = Math.round(centerY + (radius + 3) * Math.sin(angle));
      
      if (x >= 0 && x < 30 && y >= 0 && y < 20) {
        const phil = this.philosophers[i];
        let symbol = '🤔'; // thinking
        if (phil.state === 'eating') symbol = '🍽️';
        else if (phil.state === 'waiting') symbol = '😴';
        
        // Philosopher
        if (x > 0) content[y][x-1] = symbol[0];
        content[y][x] = symbol[1];
        
        // Forks
        const forkAngle1 = ((i - 0.5) * 360 / NUM_PHILOSOPHERS - 90) * Math.PI / 180;
        const forkAngle2 = ((i + 0.5) * 360 / NUM_PHILOSOPHERS - 90) * Math.PI / 180;
        
        const fx1 = Math.round(centerX + radius * Math.cos(forkAngle1));
        const fy1 = Math.round(centerY + radius * Math.sin(forkAngle1));
        const fx2 = Math.round(centerX + radius * Math.cos(forkAngle2));
        const fy2 = Math.round(centerY + radius * Math.sin(forkAngle2));
        
        if (fx1 >= 0 && fx1 < 30 && fy1 >= 0 && fy1 < 20) {
          content[fy1][fx1] = phil.hasLeftFork ? ' ' : '|';
        }
        if (fx2 >= 0 && fx2 < 30 && fy2 >= 0 && fy2 < 20) {
          content[fy2][fx2] = phil.hasRightFork ? ' ' : '|';
        }
      }
    }
    
    // Convert to string with colors
    let output = '{center}DINING TABLE{/center}\n\n';
    for (let y = 0; y < 20; y++) {
      let line = '';
      for (let x = 0; x < 30; x++) {
        const char = content[y][x];
        if (char === '○') {
          line += '{white-fg}○{/}';
        } else if (char === '|') {
          line += '{cyan-fg}|{/}';
        } else {
          line += char;
        }
      }
      output += line + '\n';
    }
    
    this.box.setContent(output);
    this.screen.render();
  }
}

// Stats box to display statistics
class StatsBox {
  constructor(box, screen) {
    this.box = box;
    this.screen = screen;
    this.stats = {};
  }

  updateStats(id, stats) {
    this.stats[id] = stats;
    this.render();
  }

  render() {
    let content = '{center}STATISTICS{/center}\n\n';
    
    let totalThinking = 0, totalWaiting = 0, totalEating = 0;
    let totalThinkingCount = 0, totalEatingCount = 0;
    
    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
      if (this.stats[i]) {
        const s = this.stats[i];
        totalThinking += s.thinkingTime;
        totalWaiting += s.waitingTime;
        totalEating += s.eatingTime;
        totalThinkingCount += s.thinkingCount;
        totalEatingCount += s.eatingCount;
        
        content += `P${i}: `;
        content += `T:${Math.round(s.thinkingTime/1000)}s `;
        content += `W:${Math.round(s.waitingTime/1000)}s `;
        content += `E:${Math.round(s.eatingTime/1000)}s\n`;
      }
    }
    
    content += '\n{cyan-fg}Averages:{/}\n';
    content += `Thinking: ${Math.round(totalThinking/NUM_PHILOSOPHERS/1000)}s\n`;
    content += `Waiting: ${Math.round(totalWaiting/NUM_PHILOSOPHERS/1000)}s\n`;
    content += `Eating: ${Math.round(totalEating/NUM_PHILOSOPHERS/1000)}s\n`;
    content += `\nMeals: ${totalEatingCount}`;
    
    this.box.setContent(content);
    this.screen.render();
  }
}

// Define the philosopher state machine
const philosopherModel = hsm.define('Philosopher',
  hsm.initial(hsm.target('thinking')),
  
  hsm.state('thinking',
    hsm.entry(function(inst) {
      inst.updateState('thinking');
    }),
    hsm.transition(
      hsm.after(function(inst) { 
        return inst.getRandomTime(THINKING_TIME); 
      }),
      hsm.target('hungry')
    )
  ),
  
  hsm.state('hungry',
    hsm.entry(function(inst) {
      inst.updateState('waiting');
    }),
    hsm.transition(
      hsm.on('try_acquire'),
      hsm.guard(function(inst) {
        return inst.tryAcquireForks();
      }),
      hsm.target('eating')
    ),
    hsm.transition(
      hsm.on('try_acquire'),
      hsm.target('.'),  // Self transition to retry
      hsm.effect(function(inst) {
        // Retry after a short delay
        setTimeout(() => inst.dispatch('try_acquire'), 100);
      })
    ),
    // Initial attempt
    hsm.transition(
      hsm.after(function() { return 10; }),
      hsm.effect(function(inst) {
        inst.dispatch('try_acquire');
      })
    )
  ),
  
  hsm.state('eating',
    hsm.entry(function(inst) {
      inst.updateState('eating');
    }),
    hsm.exit(function(inst) {
      inst.releaseForks();
    }),
    hsm.transition(
      hsm.after(function(inst) {
        return inst.getRandomTime(EATING_TIME);
      }),
      hsm.target('thinking')
    )
  )
);

// Create the UI
const screen = blessed.screen({
  smartCSR: true,
  title: 'Dining Philosophers Problem'
});

// Create philosopher boxes
const philosopherBoxes = [];
const positions = [
  { top: 0, left: 'center' },           // Top
  { top: 'center', right: 0 },          // Right
  { bottom: 0, right: 'center-20' },    // Bottom-right
  { bottom: 0, left: 'center-20' },     // Bottom-left
  { top: 'center', left: 0 }            // Left
];

for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
  const box = blessed.box({
    ...positions[i],
    width: 25,
    height: 10,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'white' } }
  });
  philosopherBoxes.push(box);
  screen.append(box);
}

// Create central table visualization
const tableBox = blessed.box({
  top: 'center-5',
  left: 'center-15',
  width: 32,
  height: 25,
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'cyan' } }
});
screen.append(tableBox);

// Create stats box
const statsBox = blessed.box({
  bottom: 0,
  left: 'center',
  width: 30,
  height: 15,
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'green' } }
});
screen.append(statsBox);

// Create info box
const infoBox = blessed.box({
  top: 0,
  right: 0,
  width: 25,
  height: 8,
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'yellow' } },
  content: `
{center}Controls{/center}

Q - Quit
S - Show/Hide Stats

Using resource
hierarchy to prevent
deadlock`
});
screen.append(infoBox);

// Create table and stats visualizers
const tableViz = new TableBox(tableBox, screen);
const statsViz = new StatsBox(statsBox, screen);

// Create forks
const forks = [];
for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
  forks.push(new Fork(i));
}

// Create philosopher instances
const philosophers = [];
for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
  const leftFork = forks[i];
  const rightFork = forks[(i + 1) % NUM_PHILOSOPHERS];
  const philosopher = new PhilosopherInstance(
    i, leftFork, rightFork, screen, 
    philosopherBoxes[i], statsViz, tableViz
  );
  philosophers.push(philosopher);
}

// Start all philosophers
philosophers.forEach(phil => {
  hsm.start(phil, philosopherModel);
});

// Update stats periodically
setInterval(() => {
  philosophers.forEach(phil => phil.updateStats());
}, 1000);

// Handle keyboard input
let statsVisible = true;
screen.key(['s', 'S'], () => {
  statsVisible = !statsVisible;
  if (statsVisible) {
    statsBox.show();
  } else {
    statsBox.hide();
  }
  screen.render();
});

screen.key(['q', 'Q', 'escape'], () => {
  philosophers.forEach(phil => phil.stop());
  process.exit(0);
});

// Initial render
screen.render();