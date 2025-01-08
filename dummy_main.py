import eel    
import pandas as pd
import subprocess
import time
from io import StringIO
import os

@eel.expose
def web_crack():
    print("Hello, world")


@eel.expose
def get_list():
    return ['fuck', 'it', 'all']

@eel.expose
def get_select_nets(selected_net):
    print(f"selected net:{selected_net}")



@eel.expose
def send_progress():
    global framesNeeded
    framesReady = 0

    for i in range(100):
        time.sleep(0.01)
        eel.updateProgress(i, 100)
    
    eel.finalUpdate('fuck', '')

@eel.expose
def give_info():
    return "Fuck you"

eel.init('front')
eel.start('index.html', mode="chrome", size=(760, 760))