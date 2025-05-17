document.addEventListener('DOMContentLoaded', () => {
    const newMainTaskInput = document.getElementById('newMainTaskInput');
    const addMainTaskBtn = document.getElementById('addMainTaskBtn');
    const taskListContainer = document.getElementById('taskListContainer');

    let tasks = JSON.parse(localStorage.getItem('hierarchicalTasks')) || [];
    let globalTimerInterval = null;
    const ACTIVE_TIMER_UPDATE_INTERVAL = 1000; // 1 second

    // --- Helper Functions ---
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function saveTasks() {
        localStorage.setItem('hierarchicalTasks', JSON.stringify(tasks));
    }

    function findTaskById(taskId, taskArray = tasks) {
        for (let task of taskArray) {
            if (task.id === taskId) return task;
            if (task.subTasks && task.subTasks.length > 0) {
                const foundInSub = findTaskById(taskId, task.subTasks);
                if (foundInSub) return foundInSub;
            }
        }
        return null;
    }

    // --- Timer Management ---
    function startTimerInternal(task) {
        if (!task || task.startTime) return; // Already running or no task
        task.startTime = Date.now();
        task.status = 'in-progress';
        ensureGlobalTimerIsRunning();
        saveTasks();
        renderTasks(); // Re-render to update UI
    }

    function stopTimerInternal(task) {
        if (!task || !task.startTime) return; // Not running or no task
        const duration = Math.floor((Date.now() - task.startTime) / 1000);
        task.elapsedTime += duration;
        task.startTime = null;
        // Task status remains 'in-progress' unless changed by user via dropdown
        checkAndStopGlobalTimer();
        saveTasks();
        renderTasks(); // Re-render to update UI
    }

    function updateActiveTimerDisplays() {
        let hasActiveTimers = false;
        tasks.forEach(mainTask => {
            if (updateSingleTaskTimerDisplay(mainTask)) hasActiveTimers = true;
            if (mainTask.subTasks) {
                mainTask.subTasks.forEach(subTask => {
                    if (updateSingleTaskTimerDisplay(subTask)) hasActiveTimers = true;
                });
            }
        });
        if (!hasActiveTimers && globalTimerInterval) {
            clearInterval(globalTimerInterval);
            globalTimerInterval = null;
        }
    }

    function updateSingleTaskTimerDisplay(task) {
        if (task.status === 'in-progress' && task.startTime) {
            const taskElement = document.querySelector(`.task-item[data-task-id="${task.id}"]`);
            if (taskElement) {
                const timerDisplay = taskElement.querySelector('.timer-display');
                const currentTimeSinceStart = Math.floor((Date.now() - task.startTime) / 1000);
                timerDisplay.textContent = formatTime(task.elapsedTime + currentTimeSinceStart);
                return true; // Indicates an active timer was updated
            }
        }
        return false; // No active timer for this task
    }

    function ensureGlobalTimerIsRunning() {
        if (!globalTimerInterval) {
            globalTimerInterval = setInterval(updateActiveTimerDisplays, ACTIVE_TIMER_UPDATE_INTERVAL);
        }
    }

    function checkAndStopGlobalTimer() {
        const hasActive = tasks.some(mt =>
            (mt.status === 'in-progress' && mt.startTime) ||
            (mt.subTasks && mt.subTasks.some(st => st.status === 'in-progress' && st.startTime))
        );
        if (!hasActive && globalTimerInterval) {
            clearInterval(globalTimerInterval);
            globalTimerInterval = null;
        }
    }


    // --- Task CRUD and State Changes ---
    function addTask(text, parentId = null) {
        if (!text.trim()) return;

        const newTask = {
            id: generateId(),
            text: text.trim(),
            status: 'pending', // 'pending', 'in-progress', 'completed'
            elapsedTime: 0,    // in seconds
            startTime: null,   // timestamp when timer started
            subTasks: []
        };

        if (parentId) {
            const parentTask = findTaskById(parentId);
            if (parentTask) {
                parentTask.subTasks.push(newTask);
            } else {
                console.error("Parent task not found for sub-task:", parentId);
                return;
            }
        } else {
            tasks.push(newTask);
        }
        saveTasks();
        renderTasks();
    }

    function deleteTask(taskId) {
        tasks = tasks.filter(task => task.id !== taskId);
        tasks.forEach(task => {
            if (task.subTasks) {
                task.subTasks = task.subTasks.filter(sub => sub.id !== taskId);
            }
        });
        const task = findTaskById(taskId); // To handle stopping timer if deleted while running
        if (task && task.startTime) {
            stopTimerInternal(task); // Ensure timer is gracefully stopped if task is deleted
        }
        saveTasks();
        renderTasks();
        checkAndStopGlobalTimer(); // Check if global timer needs to stop
    }

    function updateTaskStatus(taskId, newStatus) {
        const task = findTaskById(taskId);
        if (!task) return;

        const oldStatus = task.status;
        task.status = newStatus;

        if (oldStatus === 'in-progress' && newStatus !== 'in-progress') {
            stopTimerInternal(task); // Stop timer if moving out of in-progress
        } else if (newStatus === 'in-progress' && oldStatus !== 'in-progress') {
            startTimerInternal(task); // Start timer if moving into in-progress
        } else if (newStatus === 'in-progress' && !task.startTime) {
            startTimerInternal(task); // If it's already in-progress but timer was stopped, restart
        }

        saveTasks();
        renderTasks(); // Re-render for UI changes (button visibility, etc.)
    }

    // --- Rendering ---
    function createTaskElement(task, isSubTask = false) {
        const taskItem = document.createElement('div');
        taskItem.classList.add('task-item', isSubTask ? 'sub-task' : 'main-task');
        taskItem.dataset.taskId = task.id;

        // Task Header
        const taskHeader = document.createElement('div');
        taskHeader.classList.add('task-header');

        const taskText = document.createElement('span');
        taskText.classList.add('task-text');
        taskText.textContent = task.text;

        const taskControls = document.createElement('div');
        taskControls.classList.add('task-controls');

        // Status Select
        const statusSelect = document.createElement('select');
        statusSelect.classList.add('task-status-select');
        ['pending', 'in-progress', 'completed'].forEach(statusValue => {
            const option = document.createElement('option');
            option.value = statusValue;
            option.textContent = statusValue.charAt(0).toUpperCase() + statusValue.slice(1).replace('-', ' ');
            if (task.status === statusValue) option.selected = true;
            statusSelect.appendChild(option);
        });
        statusSelect.classList.add(`status-${task.status}`);
        statusSelect.addEventListener('change', (e) => updateTaskStatus(task.id, e.target.value));

        // Timer Display
        const timerDisplay = document.createElement('span');
        timerDisplay.classList.add('timer-display');
        let displayTime = task.elapsedTime;
        if (task.status === 'in-progress' && task.startTime) {
            displayTime += Math.floor((Date.now() - task.startTime) / 1000);
            ensureGlobalTimerIsRunning(); // Make sure timer updates if page reloaded on active task
        }
        timerDisplay.textContent = formatTime(displayTime);


        // Start/Stop Buttons
        const startBtn = document.createElement('button');
        startBtn.classList.add('start-btn');
        startBtn.textContent = 'Start';
        startBtn.addEventListener('click', () => startTimerInternal(task));

        const stopBtn = document.createElement('button');
        stopBtn.classList.add('stop-btn');
        stopBtn.textContent = 'Stop';
        stopBtn.addEventListener('click', () => stopTimerInternal(task));

        // Delete Button
        const deleteBtn = document.createElement('button');
        deleteBtn.classList.add('delete-btn');
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteTask(task.id));

        // Button visibility logic
        if (task.status === 'completed') {
            startBtn.classList.add('hidden');
            stopBtn.classList.add('hidden');
        } else if (task.status === 'in-progress') {
            if (task.startTime) { // Timer is running
                startBtn.classList.add('hidden');
            } else { // In-progress but paused
                stopBtn.classList.add('hidden');
            }
        } else { // Pending
            stopBtn.classList.add('hidden');
        }


        taskControls.appendChild(statusSelect);
        taskControls.appendChild(timerDisplay);
        taskControls.appendChild(startBtn);
        taskControls.appendChild(stopBtn);
        taskControls.appendChild(deleteBtn);

        taskHeader.appendChild(taskText);
        taskHeader.appendChild(taskControls);
        taskItem.appendChild(taskHeader);

        // Sub-task section (only for main tasks)
        if (!isSubTask) {
            const subTaskSection = document.createElement('div');
            subTaskSection.classList.add('add-sub-task-section');

            const newSubTaskInput = document.createElement('input');
            newSubTaskInput.type = 'text';
            newSubTaskInput.classList.add('new-sub-task-input');
            newSubTaskInput.placeholder = 'Add sub-task...';
            newSubTaskInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addTask(newSubTaskInput.value, task.id);
                    newSubTaskInput.value = '';
                }
            });


            const addSubTaskBtn = document.createElement('button');
            addSubTaskBtn.classList.add('add-sub-task-btn');
            addSubTaskBtn.textContent = 'Add Sub';
            addSubTaskBtn.addEventListener('click', () => {
                addTask(newSubTaskInput.value, task.id);
                newSubTaskInput.value = '';
            });

            subTaskSection.appendChild(newSubTaskInput);
            subTaskSection.appendChild(addSubTaskBtn);
            taskItem.appendChild(subTaskSection);

            if (task.subTasks && task.subTasks.length > 0) {
                const subTaskListDiv = document.createElement('div');
                subTaskListDiv.classList.add('sub-task-list');
                task.subTasks.forEach(subTask => {
                    subTaskListDiv.appendChild(createTaskElement(subTask, true));
                });
                taskItem.appendChild(subTaskListDiv);
            }
        }
        return taskItem;
    }

    function renderTasks() {
        taskListContainer.innerHTML = '';
        tasks.forEach(task => {
            taskListContainer.appendChild(createTaskElement(task));
        });
        checkAndStopGlobalTimer(); // Ensure global timer state is correct after render
    }

    // --- Event Listeners ---
    addMainTaskBtn.addEventListener('click', () => {
        addTask(newMainTaskInput.value);
        newMainTaskInput.value = '';
    });
    newMainTaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTask(newMainTaskInput.value);
            newMainTaskInput.value = '';
        }
    });

    // --- Initial Load ---
    renderTasks();
    // If there are any initially active timers (e.g. from a page refresh), start the global updater
    tasks.forEach(mainTask => {
        if (mainTask.status === 'in-progress' && mainTask.startTime) ensureGlobalTimerIsRunning();
        if (mainTask.subTasks) {
            mainTask.subTasks.forEach(subTask => {
                if (subTask.status === 'in-progress' && subTask.startTime) ensureGlobalTimerIsRunning();
            });
        }
    });
});