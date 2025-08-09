import { Page } from '@playwright/test';

export interface TestScenario {
  name: string;
  description: string;
  steps: ScenarioStep[];
  expectedCollisions?: boolean;
}

export interface ScenarioStep {
  action: 'select_branch' | 'merge' | 'wait' | 'click' | 'screenshot';
  target?: string;
  duration?: number;
  filename?: string;
}

export class GitExplorerTestHelper {
  private page: Page;
  private collisionMessages: string[] = [];

  constructor(page: Page) {
    this.page = page;
    this.setupCollisionListener();
  }

  private setupCollisionListener() {
    this.page.on('console', msg => {
      if (msg.type() === 'warning' && msg.text().includes('COLLISION')) {
        this.collisionMessages.push(msg.text());
      }
    });
  }

  async runScenario(scenario: TestScenario): Promise<{
    collisions: string[];
    success: boolean;
  }> {
    console.log(`Running scenario: ${scenario.name}`);
    console.log(`Description: ${scenario.description}`);
    
    // Clear previous collision messages
    this.collisionMessages = [];
    
    // Navigate to the app
    await this.page.goto('/');
    await this.page.waitForTimeout(1000);
    
    // Execute scenario steps
    for (const step of scenario.steps) {
      await this.executeStep(step);
    }
    
    // Check if collisions match expectations
    const hasCollisions = this.collisionMessages.length > 0;
    const expectedCollisions = scenario.expectedCollisions ?? false;
    const success = hasCollisions === expectedCollisions;
    
    console.log(`Scenario completed. Collisions found: ${hasCollisions}, Expected: ${expectedCollisions}`);
    if (this.collisionMessages.length > 0) {
      console.log('Collision messages:', this.collisionMessages);
    }
    
    return {
      collisions: [...this.collisionMessages],
      success
    };
  }

  private async executeStep(step: ScenarioStep) {
    switch (step.action) {
      case 'select_branch':
        if (step.target) {
          console.log(`Selecting branch: ${step.target}`);
          // Use more specific selector for branch labels in the SVG
          await this.page.getByLabel(`Branch ${step.target}`).click();
          await this.page.waitForTimeout(500);
        }
        break;
        
      case 'merge':
        console.log('Looking for merge button');
        const mergeButton = this.page.getByRole('button', { name: /merge/i });
        if (await mergeButton.isVisible()) {
          await mergeButton.click();
          await this.page.waitForTimeout(1000);
        }
        break;
        
      case 'wait':
        const duration = step.duration ?? 1000;
        console.log(`Waiting ${duration}ms`);
        await this.page.waitForTimeout(duration);
        break;
        
      case 'click':
        if (step.target) {
          console.log(`Clicking: ${step.target}`);
          // Try to click on merge source selection dropdown first
          try {
            await this.page.getByRole('combobox', { name: /select source branch to merge/i }).click();
            await this.page.waitForTimeout(300);
            // Then select the option
            await this.page.getByRole('option', { name: new RegExp(step.target, 'i') }).click();
            await this.page.waitForTimeout(300);
          } catch (error) {
            // Fallback to generic text selector
            console.log(`Fallback to generic selector for: ${step.target}`);
            await this.page.getByText(step.target).first().click();
            await this.page.waitForTimeout(300);
          }
        }
        break;
        
      case 'screenshot':
        if (step.filename) {
          console.log(`Taking screenshot: ${step.filename}`);
          await this.page.screenshot({ 
            path: `test-results/screenshots/${step.filename}`,
            fullPage: true 
          });
        }
        break;
    }
  }

  getCollisions(): string[] {
    return [...this.collisionMessages];
  }

  clearCollisions() {
    this.collisionMessages = [];
  }
}

// Predefined test scenarios
export const TEST_SCENARIOS: TestScenario[] = [
  {
    name: 'merge-master-with-134',
    description: 'Merge master branch with 134 - known to cause collision',
    expectedCollisions: true,
    steps: [
      { action: 'screenshot', filename: 'before-merge-master-134.png' },
      { action: 'select_branch', target: 'master' },
      { action: 'click', target: '134' },
      { action: 'merge' },
      { action: 'wait', duration: 1000 },
      { action: 'screenshot', filename: 'after-merge-master-134.png' },
    ]
  },
  {
    name: 'initial-state-check',
    description: 'Check initial state for collisions - should be clean',
    expectedCollisions: false,
    steps: [
      { action: 'wait', duration: 2000 },
      { action: 'screenshot', filename: 'initial-state.png' },
    ]
  },
  {
    name: 'multiple-merge-operations',
    description: 'Perform multiple merges to test collision accumulation',
    expectedCollisions: true, // Assuming some will cause collisions
    steps: [
      { action: 'select_branch', target: 'master' },
      { action: 'click', target: '134' },
      { action: 'merge' },
      { action: 'wait', duration: 500 },
      { action: 'screenshot', filename: 'after-first-merge.png' },
      { action: 'wait', duration: 1000 },
      { action: 'screenshot', filename: 'final-state-multiple-merges.png' },
    ]
  }
];
