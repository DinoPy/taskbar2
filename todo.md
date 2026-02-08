# TODO - Taskbar2
# UNFILTERED
- NATURAL LANGUAGE PARSER:
     - daily from 9 to 18 every 30 minutes
     - seems to allow instant times I the past. Saying Tuesday today being Friday allows for a past event


- ALL: Add a duration for all tasks when created from schedule or any other location.
    - We should consider how we can display tasks on the calendar as well without overlapping with the occurence that created the task.

- In order to double record reminders/tasks let's add something to copy  the list of tasks that were recorded as reminders


!!!!!!!!! Lets look into what google calendar requires to set events of all types, maybe we can use that in the project. 
- Also look into how we can log in with an email specifically for events purposes so we can do crud on events. but also sync what's on calendar with what's local. Maybe selectively? sync this category with this email?

- To look into how to use biometrics to access the app, may be a cool idea? :))) but may also slow the user so if added it should be toggleable.
- For the task templates we can create schedules when they'll be created.. We can have more schedules for the same template.
- Let's also update the reminder to add tags, categories and others.
- Think of a way to ensure that I see all hi bob changes so I can schedule for them, especially for actions that require documents
- Think of a way to do task lists, I would like lists that can be templateised, customizes per instance (before triggering) and during instance. These lists can be scheduled, maybe we can get a new window to quickly trigger them, maybe also customize them from the same window. Very very important to think of use cases, how we'll track this task list, how do we ensure we don't disregard or delay, how we keep it updated, maybe how we can get logs for them?
- Regarding new notifications, if I have new notifications that are pushed back (ignored) how do I know which notifications are newer, we know the order but they don't pop in the eye.

# NEW FEATURES
    ## Incomplete
        - Add some kind of warning for the tasks not having tags, mostly all of the should have tags.
        - Add an option to recommend tags based on the title and category.
        - I am thinking of a list of due tasks for today and following period that will show similar to completed tasks combined with notifications. I don't know how we can achieve this but it may require not to create the tasks directly or with x time before. Let's think of this, and see if it would bring enough value.
        - We can make a separate calendar tab that will show what task was active at that time. We can take the creation and toggle times + duration between each toggle and populate an entire day with events. Splitting tasks may break this behaviour - or we can use the order of splitting tasks and do the end date of the first task at creation date + duration? To think about this and edge cases.
        - Poate de facut si o lista de ce urmeaza sa se intample? desi asta ar exista in varianta corectata de instant schedules.
        - Do something to highlight the larger tasks that are yet to be done, I was thinking of adding another row to the taskbar with larger tasks that can stay there indefinite, maybe smaller times ones can be linked?
        - Add a search on the calendar as well, based on tasks.
        - Add a general logger similar to what hi Bob has that does async work on another database + access via web, protected?
    ## Complete


# MAIN WINDOW
    ## Incomplete
        - De considerat ideea de a avea un mini edit window? dar nu stiu daca merge si daca e optim, ideea fiind sa sumonez un mini edit doar ptr tag sau categorii sau due date.
        - De facut un pop-up care sa puna un due date la un taks, gen d3, apare common lanaguage reader, scriem o data si o ora si enter.
        - Maybe - add a fulfill button to a reminder that would create a task and toggle it on so it can be done?
        - Add a way to export these tasks? 
        - Add a command that takes categories separated by comma, lowercase them and compares them to the registered categories. This command will display the categories listed - basically a written toggle for context menu "filter by category".
        - Add commands to scroll the bar left and right such as "sl" and "sr" - which maybe scroll half of viewport
        - The context menu item for what categories to display won't repopulate correctly once the OS resumes. We can select 1 item, after resume it will show 'All categories' selected even if that's incorrect.
        - Let's make it so when we click on all categories when already selected, it will deselect that option and select the other. Maybe we can add some presets separated by a breakline for work, projects and other.
        - Ensure the taskbar returns to the position it was at when the display is reconnected or the OS resumes.
            - Save the screen serial and if reconnected, resume the taskbar to the location selected last. So for every screen we will save some coordinates.
        - Check on why the electron.window.focus doesn't work, looks like the app may be focused temporarily and unfocused
    ## Completed
        - On on complete pop up, let's add a tag list under heading "any last tags?". This way it is more likely to add missing tags but it should also display the current tags.
        - Add a fuzzy finder based on task name.

# EDIT
    ## Incomplete
        - Fix the title input so the outline doesn't go away after changing the inputs via tab or I think pressing enter?
        - Fix tags that can't be deleted on desktop.
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
        - Add a feature under completed that allows to select and do mass actions such as adding a tag to all selected tasks.
        - maybe add a context toggle for when completing tasks to show a confirmation window, maybe a custom one with are you sure that everything related to this task is now done?
    ## Complete

# SPLIT
    ## Incomplete
        - Add key shortcuts that do some actions such as: Complete tab with control enter (attempt pressing split task by shortcut), add row, maybe some quick movements? Consider adding a system like vim in browser where after pressing "/" or something you get a command box where you can do actions.
    ## Complete

# CALENDAR
    ## Incomplete
        - When displaying tasks in the same interval of an our or less, we will make a single container with all the reminders. This is only applicable to reminders, or maybe to tasks as well ? <- to process. The objective is if we have 3 reminders between 9:00-10:00 instead of showing 3 items side by side or overlapping we can include them in a box and just show them based on creation date one below the other, maybe we can prepend them with their time.
        - Add a seearch option in the calendar, we'd like to make locating events more easier, this may require a revamp of the scheduler.
        - Research if is normal for event at 14:00 to show on the row of 15:00, shouldn't it be on the row of 14:00 or what's the login behind the current structure?
        - Let's do something about events that overpopulate the calendar such as those that occur every 30 minutes, maybe we can hide these somehow, or not display them or add a filter.
        - Add an option to edit the occurence, schedule, notification, whatever the item is.
        - Think of a way to maybe populate the recurring events in the calendar so they can be deleted, the current example is drink & register water that comes every 30 to be deleted at 11:30 not to affect the stomach ability to disolve
        - I should adjust the calendar not to show by color what type of event we have but rather by a symbol --- to think about this because the issue with the calendar is larger, going too far ahead changes the content colors completely even though they reference the same thing. This may be fixed through the other ideas related to the calendar.
        - Think about a way to display all the tasks on the calendar and not only the occurences. 
        - Review the tasks due timing and consider a way to add properties so it looks like google events with intervals.
        - The calendar should have filters.
        - Maybe different forms such as week, two weeks, month?
        - Maybe connect with a calendar and share the events if possible, but selective events.
    ## Completed
        - Make the reminders only show as a line that can be clicked.
        - Add a grab bar so the calendar window can be moved around. 
        - Make calendar window show on the focused screen.
        - Add a pop-up window with details about the event when clicked.
            - Show either in details pop-up or directly on calendar the type of event.

# SCHEDULE
- I need more access to the schedule from UI!!! I can't really establish the existence of certain instant schedules placed in the future, they don't seem to display on the calendar at this time and it doesn't show on notifications either.
    ## Ideas
        - Reconsider the design, currently it looks kind of weird, I am not satisfied, not sure what is the desired output but that can be explored.
    ## Incomplete
        - Reminder window takes a good while to show up at times, find ways to optimise the trigger speed, I'd like it to show on screen right a way.
        - Add option to add tags in reminder that creates tasks.
        - Let's add reminders for tasks, r1 to show the remind screen without the first page?
        - Make the snoozed notification update on the schedule as well (so update the occurence?). Not sure about this one because I may want to see when the thing was originally due, maybe add a list of objects to the notification to mark all the snoozes with a count?
        - See what happens to reminders set for one day in the future why they don't have a due date, example  meeting primary set today (19 nov) at 15:30 for tomorrow at 4:00, does not have a due date
        - Look into how schedules, occurrences, notifications relate and how we can make the schedules especially instant ones display in schedules tab even after they are ran, but if they are ran we need to be able to delete schedule and related items
        - Let's make the reminder add pop-up show in a drop down options for reminders, it will be a multi-select defaulted to none.
        - Consider adding a right click context menu to hide some of the events, we can also categorise them somehow and filter some out. This way we have a clean view.
        - Add option to input more details about the task about to be created such as description.
        - Add a custom toggle to the natural language that will instead of take a natural text, show dropdowns for all options offered by rrule so the rule can be custom made
    ## Complete
        
# NOTIFICATIONS
    ## Ideas
        - Add a Snoozed notification tab?
        - Let's think of a different way to handle reminder, maybe we can get an AI to parse the remaining tasks and their due date and important to read a custom motivational message, we also need something for due tasks because reminders are spammed until seen but for due tasks we have nothing.
        - Should I add a notification asking from time to time to review the active tasks?
    ## Incomplete
        - Add tags in notifications, or categories so they can be better filtered. Once the variable is added we can add filters and sort to the notification window.
        - Alarms for due tasks? Also connecting the app notifications with slack? Google? So the presence and notifications are all over?
        - Let's add an alarm for reminders that ring until acknowledged or snoozed or converted to normal reminders. Maybe we can do alarm types
        - Make it so the instant notifications listed in the notification window be ordered by their due date. It should also show the consumption status. After revamping the scheduler, we are planning on generating the events with 90 days ahead. From these events we will create the tasks when the time comes (48h before or less). When we edit the recuring schedule it should ask to also edit the emited occurences, when editing an occurence on the calendar it should ask if we edit only the current one or the rest, same with deletion. 
        - Fix out of screen dropdown options that can't be used. -> When usingpressing on the snooze button, the dropdown menu shows below the reminder, if there is only a single reminder, the container is stretched.
        - Make the notification window close when the current tab/view has all items dismissed.
        - After adding a snoozed tab on desktop for notoifications let's give the option to complete them, and the server should show all the snoozed notifications with no time contraint.
        - Make it so due tasks are received as notifications as well.
        - Add archive functionality with a separate tab under navigation window, the tab will function the same as history one.
        - Fix History tab auto load 10 + infinite scroll functionality. Currently the History tab will only show the tasks that were seen and won't load any other.
        - Check why switching to notifications history won't load the last 10 notifications and the rest after through scrolling
    ## Completed

# ALL POP-UPS
    ## Incomplete
        - Add more margins to all pop-ups so the shadow shows properly, currently the delete pop-up has a contained shadow suddently cuttingAdd more margins to all pop-ups so the shadow shows properly, currently the delete pop-up has a contained shadow suddently cutting. We should make some default variables in a separate file or at the top of the main file that will be used in all instances.
    ## Complete
        - Remove the border from the MacOS 26 update and ensure all pop-ups have dynamic height.


# TEMPLATES
    ## Incomplete
        - De facut templates pentru tasks, ceva cu quick search sa fie usor de gasit si selectat. Util pentru situatii in care vrem sa vedem cat dureaza ceva estimat, fara un element comun precum numele pentru search nu putem face narrow down pe toate occurrences. De dimimneata am cautat cat dureaza drumul catre munca si pentru ca afost numit in toate felurile nu am putut gasi ca sa fac un average.
    ## Complete
        - 

# IDEAS
    - Canvas graphic with items similar to excalidraw but clickable to open some notes maybe even files.
    - Consider adding task lists create a list of tasks that are dependent on the previous one
    - Let's add a property or something to the tasks so it holds couples of toggle on and off, basically I d like to see in what intervals I worked on a task how many times it was toggled on and off
    - A screen that will display from start to finish of the day what were the active tasks, basically it will show from x to y tasc abc was active, once this one was deactivated it shows the next




# NEW FEATURES
### PRICE TRACKER??
- New feature that will allow inputing a product name, price, currency (defaulted to RON), image, maybe store?. Each item when checked will show a history of prices that must be manually updated.

### MEAL PLANNER / RECIPE NOTE TAKER (similar to Tasty).
- To process what this will contain and look like, but it will be part of the main app as well.

### LISTS
- Some lists should have the option to be password protected.
- The lists should have plenty of properties that make sense - to think about this.
- Different types of lists? Some may be checkboxes some something else?
- To also think where it makes sense to implement this first.

### Some kind of tracker feature for count of actions, with times and different formulas such as average, median etc.
### Tracker de obiective, va fi o locație sa notezi obiective și câteva variabile de diferite tipuri care sa cumuleze Intr un nivel de progress, pot fi și întrebări și detalii ce vor fi citite poate de un ai care se însumeze un nivel de progress. Se face un recurrence la cat timp să primești că un chestionar să întrebe cum merge, care e statusul. Poate și ceva motivațional? Idk, nu cred că merge pe mine
- For the objective tracker feature, we can also give a target set of variables and a date by when they should be reached, such as by x (in 2 months) finish 200 pages of a book, it if we don't reach/make progress to the targeted variables then it will start create reminders about that topic.







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
