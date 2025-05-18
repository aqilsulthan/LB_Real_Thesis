import json
import numpy as np
import sys

# Baca file log
log_file = sys.argv[1] if len(sys.argv) > 1 else 'logs/sa-hs/log.json'
try:
    with open(log_file, 'r') as f:
        log = json.load(f)
except FileNotFoundError:
    print(f"Error: {log_file} not found")
    exit(1)

# Pisahkan log berdasarkan algoritma
logs_by_algo = {'sa': [], 'hs': [], 'sahsh': [], 'dalb': []}
for entry in log:
    algo = entry.get('algorithm', 'sahsh')  # Default ke sahsh jika tidak ada
    if algo in logs_by_algo:
        logs_by_algo[algo].append(entry)

# Daftar server
server_list = [
    'http://192.168.56.11:31001',
    'http://192.168.56.11:31002',
    'http://192.168.56.12:31003',
    'http://192.168.56.12:31004',
    'http://192.168.56.13:31005',
    'http://192.168.56.13:31006'
]

# Fungsi untuk menghitung metrik per algoritma
def analyze_log(log_entries):
    if not log_entries:
        return None

    start_times = [entry['startTime'] for entry in log_entries]
    wait_times = [entry['waitTime'] for entry in log_entries]
    execution_times = [entry['executionTime'] for entry in log_entries]
    finish_times = [entry['finishTime'] for entry in log_entries]

    # Hitung metrik waktu
    avg_start_time = np.mean(start_times) if start_times else 0
    avg_wait_time = np.mean(wait_times) if wait_times else 0
    avg_execution_time = np.mean(execution_times) if execution_times else 0
    avg_finish_time = np.mean(finish_times) if finish_times else 0
    makespan = max(finish_times) if finish_times else 0

    # Hitung distribusi beban per server
    server_times = {server: 0 for server in server_list}
    for entry in log_entries:
        server_times[entry['server']] += entry['executionTime']
    
    t_max = max(server_times.values()) if server_times else 0
    t_min = min(server_times.values()) if server_times else 0
    t_avg = np.mean(list(server_times.values())) if server_times else 0
    imbalance_degree = (t_max - t_min) / t_avg if t_avg > 0 else 0

    return {
        'avg_start_time': avg_start_time,
        'avg_wait_time': avg_wait_time,
        'avg_execution_time': avg_execution_time,
        'avg_finish_time': avg_finish_time,
        'makespan': makespan,
        'imbalance_degree': imbalance_degree,
        'server_times': server_times,
        'request_count': len(log_entries)
    }

# Analisis untuk setiap algoritma
results = {}
for algo, entries in logs_by_algo.items():
    results[algo] = analyze_log(entries)

# Tampilkan hasil
print("Perbandingan Performa per Algoritma:")
print(f"{'Parameter':<25} {'SA':>15} {'HS':>15} {'SA-HS':>15} {'DALB':>15}")
print("-" * 70)

# Fungsi untuk format hasil
def print_metric(label, key, unit="ms"):
    values = []
    for algo in ['sa', 'hs', 'sahsh', 'dalb']:
        value = results[algo][key] if results[algo] else 0
        values.append(f"{value:.2f}")
    print(f"{label:<25} {values[0]:>15} {values[1]:>15} {values[2]:>15} {unit}")

# Tampilkan metrik
print_metric("Average Start Time", "avg_start_time")
print_metric("Average Wait Time", "avg_wait_time")
print_metric("Average Execution Time", "avg_execution_time")
print_metric("Average Finish Time", "avg_finish_time")
print_metric("Makespan", "makespan")
print_metric("Imbalance Degree", "imbalance_degree", unit="")

# Tampilkan jumlah request
print("\nJumlah Request per Algoritma:")
for algo in ['sa', 'hs', 'sahsh', 'dalb']:
    count = results[algo]['request_count'] if results[algo] else 0
    print(f"{algo.upper():<10} {count:>15}")

# Tampilkan distribusi beban per server
print("\nDistribusi Beban per Server (Execution Time, ms):")
print(f"{'Server':<20} {'SA':>15} {'HS':>15} {'SA-HS':>15} {'DALB':>15}")
print("-" * 70)
for server in server_list:
    values = []
    for algo in ['sa', 'hs', 'sahsh', 'dalb']:
        value = results[algo]['server_times'][server] if results[algo] else 0
        values.append(f"{value:.2f}")
    print(f"{server:<20} {values[0]:>15} {values[1]:>15} {values[2]:>15}")
