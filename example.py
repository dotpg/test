#9**10+10**9を求めるプログラムを構成する
def pow(a,b):
    res:int = 1
    for i in range(b):
        res*=a
    return res