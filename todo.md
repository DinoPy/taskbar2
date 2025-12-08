# TODO - Taskbar2
# UNFILTERED
- Look into how schedules, occurrences, notifications relate and how we can make the schedules especially instant ones display in schedules tab even after they are ran, but if they are ran we need to be able to delete schedule and related items
- See what happens to reminders set for one day in the future why they don't have a due date, example  meeting primary set today (19 nov) at 15:30 for tomorrow at 4:00, does not have a due date



# MAIN WINDOW
    ## Incomplete
        - The context menu item for what categories to display won't repopulate correctly once the OS resumes. We can select 1 item, after resume it will show 'All categories' selected even if that's incorrect.
        - Let's make it so when we click on all categories when already selected, it will deselect that option and select the other. Maybe we can add some presets separated by a breakline for work, projects and other.
        - Ensure the taskbar returns to the position it was at when the display is reconnected or the OS resumes.
    ## Completed

# EDIT
    ## Incomplete
    ## Completed
        - The description window adds a double quotation mark (") for and removes the quotations and commas within, check if this is necessary and remove if not. We don't want the quotations keep showing.
        - Update the default description as well, it can be an empty string.

# DELETE
    ## Incomplete
    ## Complete
        - Make the confirmation pop-up be focused when shown, and the confirmation button be outlined, or the cancel button?
        - The confirmation pop-up has a fixed height, long title tasks won't fit and will cause scrolling to show. Add dynamic height.

# COMPLETED
    ## Incomplete
        - maybe add a context toggle for when completing tasks to show a confirmation window, maybe a custom one with are you sure that everything related to this task is now done?
    ## Complete

# CALENDAR
    ## Incomplete
        - Make calendar window show on the focused screen.∑v∑d
        - Make the reminders only show as a line that can be clicked.
        - Add a pop-up window with details about the event when clicked.
            - Show either in details pop-up or directly on calendar the type of event.
        - Add an option to edit the occurence, schedule, notification, whatever the item is.
        - Think of a way to maybe populate the recurring events in the calendar so they can be deleted, the current example is drink & register water that comes every 30 to be deleted at 11:30 not to affect the stomach ability to disolve
    ## Completed
        
# NOTIFICATIONS
    ## Ideas
        - Add a Snoozed notification tab?
    ## Incomplete
        - Add archive functionality with a separate tab under navigation window, the tab will function the same as history one.
        - Fix History tab auto load 10 + infinite scroll functionality. Currently the History tab will only show the tasks that were seen and won't load any other.
        - Check why switching to notifications history won't load the last 10 notifications and the rest after through scrolling
    ## Completed

# ALL POP-UPS
    ## Incomplete
        - Remove the border from the MacOS 26 update and ensure all pop-ups have dynamic height.
    ## Complete



# IDEAS
    - Canvas graphic with items similar to excalidraw but clickable to open some notes maybe even files.
    - Consider adding task lists create a list of tasks that are dependent on the previous one
    - Let's add a property or something to the tasks so it holds couples of toggle on and off, basically I d like to see in what intervals I worked on a task how many times it was toggled on and off
    - A screen that will display from start to finish of the day what were the active tasks, basically it will show from x to y tasc abc was active, once this one was deactivated it shows the next









## 🔴 Critical Issues / Bugs

### High Priority
- [ ] **Calendar not showing schedules or occurrences** - Fix calendar display, then ensure events created on UI based on schedules don't duplicate occurrences (check based on occurrence ID and occurs_at)
- [ ] Fix app not moving back to preferred window on OS resume
- [ ] Fix listener memory leak - `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 closed listeners added to [WebContents]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit`
- [ ] When a task is completed from another category, the category header still shows and the command input errors. When changing the category of a task it won't move from the current category box
- [ ] See why sometimes the timer won't stop when toggling off a task

### Medium Priority
- [ ] When adding a schedule, the notifications window opens and won't close when the first notif command is sent

---

## 📅 Calendar

### High Priority
- [ ] Fix calendar to show schedules and occurrences
- [ ] Prevent duplicate occurrences when creating events from schedules (check based on occurrence ID and occurs_at)

### Future Enhancements
- [ ] Think of a system for recurrent shifts (will be created by the server) with a calendar and preferably something to interpret human language into a recurrence pattern (e.g., "every monday, wednesday and friday at 12 pm"). These tasks will have a due date and should have a "show before" property as well.

---

## ✅ Tasks

### High Priority
- [ ] Move due dates logic to server - server should control when a task should show or hide. Tasks will exist in client as usual, but there won't be an interval function that shows them - it will be an event from the server. This event will also trigger notifications on the mobile app at a later point.
- [ ] Move due tasks logic to backend - frontend will only respond to the task not being done actively
- [ ] Add a check for deletion of tasks (e.g., "Are you sure you'd like to delete task x\ny\nz?")

### Medium Priority
- [ ] Add an estimated/target duration for activities to tasks - provide an estimate of how much we expect the task to take (need to think about what we'll do with this information and how we'll use it)
- [ ] Make title scrollable instead of ellipsis

### Completed ✓
- [x] Add the due date and time to the top of a task (between category and duration)
- [x] Add shortcut to edit any task - adjust current edit shortcut and behavior to trigger an input box that opens a given task rather than the active one
- [x] When submitting any edit, the due date defaults to current date but some tasks don't have a due date - if no due date is selected, don't update the due date to the current time
- [x] Fix - when a task is completed while the command input is open there is an error on .removeFocus
- [x] Maybe center all tasks? They are more likely to be visible

---

## 📋 Schedules

### High Priority
- [ ] When deleting a schedule, ask if the user would like to delete the tasks generated from it so far - send a truthy variable to the server to delete tasks based on the schedule ID (which will be a property on the task table)

### Medium Priority
- [ ] Add a property to save natural language in schedule table and populate the schedule tab with the natural language

### Completed ✓
- [x] Add event when a schedule is ran and deactivated that requests the UI to delete that schedule as well
  - [x] One-time schedules should be completed when they create the task they should create, or send the reminder they should send/create. The scheduled event listing should go away from the UI after the event passes.

---

## 🔔 Notifications

### High Priority
- [ ] Add date on notifications in the notification window
- [ ] Add scroll load to new notifications - currently only the first 10 are loaded, or load all of them at once no matter how many

### Completed ✓
- [x] Make the notification app when opened because of a notification show on New tab and not on the previously seen tab
- [x] Make a key shortcut (Command+Shift+S) to trigger the notification window

---

## ⏰ Reminders

### Completed ✓
- [x] Add reminder system
  - [x] Should take natural language for how the tasks should be ran
  - [x] Reminder can become a task once it triggers or it cannot
  - [x] Reminders should be events from server sent to all devices + notifications on the phone
  - [x] Reminders can have a due date as well as "see before due date" property
- [x] Make reminder pop-up dynamic height or larger to not cause scroll

---

## 📝 Completed Tasks

### Medium Priority
- [ ] Reconsider the order of the completed tasks list - currently oldest down, starts from beginning of day to end. Need to go to last day, read top to bottom, then move to next day that's up and read top to bottom (it's an unnatural movement)

### Completed ✓
- [x] Add day separation to complete pop-up
- [x] Add duplicate functionality from completed tasks
  - [x] Revamp the completion view and add a column for action buttons such as edit, duplicate, split, even delete

---

## ⌨️ Commands

### Medium Priority
- [ ] Maybe add the option to do consecutive commands space separated in the app
- [ ] Add input box that takes a letter and an index - index will be the task's and letter will be the shortcut of the command (e.g., d4 = delete task 4, e3 = edit task 3, ec = edit current, sd = sort by due date, sda = sort due date ascending, sc = show category, scwork = show category work, etc.)

### Completed ✓
- [x] Implement the duplicate functionality
- [x] Add a command to cycle through the taskbar positions
- [x] Adjust the format of the taskbar and the contents of the tasks

---

## 🗣️ Language Parser

### Medium Priority
- [ ] Add "between" keyword to language parser - idea would be to have hourly, minutely reminders that will run between intervals

---

## 🎨 UI/UX

### High Priority
- [ ] Fix the width of the right side container controls to fit everything and not resize

### Medium Priority
- [ ] Make title scrollable instead of ellipsis

### Completed ✓
- [x] Add a background to the command input

---

## 📱 Mobile

### Medium Priority
- [ ] Disable start autocapitalization on input fields on mobile

---

## ⚙️ Backend/Server

### High Priority
- [ ] Move due dates logic to server - server should control when a task should show or hide
- [ ] Move due tasks logic to backend - frontend will only respond to the task not being done actively

### Completed ✓
- [x] Reconsider how we handle due tasks - add notification in app when a task becomes available + some color detail
- [x] Add an overdue tasks badge

---

## 💡 Future Ideas / Features

### Templates
- [ ] Think of a system for templating

### Task Management
- [ ] Maybe also add merge tasks? To merge br and hn tasks in one? (even though we may not want that, we may rather prefer excluding these tasks)
- [ ] Maybe add location for tasks?
- [ ] Maybe an emotion property that will be used to describe a state when doing an action?
- [ ] Think of a plan to add lists of line items that can become independent tasks - these lists can be linked to a reminder and can become tasks

---

## 📊 Summary

### By Priority
- **Critical/High**: 9 items
- **Medium**: 9 items
- **Future Ideas**: 4 items
- **Completed**: 20+ items

### By Feature
- Calendar: 2 active, 1 future
- Tasks: 4 active, 5 completed
- Schedules: 2 active, 1 completed
- Notifications: 2 active, 2 completed
- Reminders: 0 active, 6 completed
- Completed Tasks: 1 active, 2 completed
- Commands: 2 active, 3 completed
- Language Parser: 1 active
- UI/UX: 2 active, 1 completed
- Mobile: 1 active
- Backend/Server: 2 active, 2 completed
- Future Ideas: 4 items
