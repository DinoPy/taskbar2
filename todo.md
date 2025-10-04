[x] adjust the format of the taskbar and the contents of the tasks.
[x] implement the duplicate functionality
[x] add day separation to complete pop-up
[] fix the app not moving back to the prefered window on os resume.
[x] add the due date and time to the top of a task in between category and duration.
[] add shortcut to edit any task, possibly adjust the current edit shortcut and behaviour to trigger an input box that will open a given task rather than the active one.
[x] add duplicate functionality form completed tasks. 
    [] Maybe revamp the completion view and make add a column for action buttons such as edit, duplicate, split, even delete?
[x] currently on submission of any edit, the due date defaults to current date but some tasks don't have a due date. If no due date is selected, don't update the due date to the current time.
[x] maybe center all tasks? They are more likely to visible
[] Add a command to cycle through the taskbar positions.
[] Maybe along with some of the existent commands I can add an input box that will take a letter and an index. The index will be the task's and the letter will be the shortcut of the command, such as d4 (delete task 4) or (e3) edit task 3. Maybe we can add something like ec (as edit current, the one that's active), maybe we can add something to sort like this such as sd (blocking the key s from being used in other commands) which will be sort by due date, maybe sda - sort duedate ascending and a bunch of other combinations. Maybe have shortcuts to show only a certain category such as sc or scwork (likely other shortcut letter)
[] Maybe also add merge tasks? To merge br and hn tasks in one? even though we may not want that, we may rather prefer exclutding these tasks.
[] Fix the listener issue
```MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 closed listeners added to [WebContents]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit```

### Due tasks
[] maybe reconsider how we handle due tasks, we need to add a notification in app when a task becomes available + some color detail.
[] Add an overdue tasks badge.
[] move the logic to the backend and the frontend will only respond to the task not being done actively.



# MOBILE
[] disable start autocapitalization on input fields on mobile.
