import json
import numpy as np
import sys
import os

valid_algos = ['sa', 'hs', 'sahsh', 'dalb', 'dalevy', 'fpa', 'rr', 'aco', 'pso', 'ga']
algo_arg = sys.argv[1] if len(sys.argv) > 1 else None

logs_by_algo = {algo: [] for algo in valid_algos}

def load_log_safe(path):
    try:
        if os.path.exists(path):
            with open(path, 'r') as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
    except Exception as e:
        print(f"Warning: Failed to parse {path} – {e}")
    return []

if algo_arg:
    if algo_arg not in valid_algos:
        print(f"Error: Invalid algorithm '{algo_arg}'. Must be one of: {', '.join(valid_algos)}")
        exit(1)
    logs_by_algo[algo_arg] = load_log_safe(f'logs/{algo_arg}/log.json')
else:
    for algo in valid_algos:
        logs_by_algo[algo] = load_log_safe(f'logs/{algo}/log.json')

# Daftar server
server_list = [
    'http://192.168.56.11:31001', 'http://192.168.56.11:31002',
    'http://192.168.56.12:31003', 'http://192.168.56.12:31004',
    'http://192.168.56.13:31005', 'http://192.168.56.13:31006'
]

def analyze_log(log_entries):
    if not log_entries:
        return {
            'avg_start_time': 0.0,
            'avg_wait_time': 0.0,
            'avg_execution_time': 0.0,
            'avg_finish_time': 0.0,
            'makespan': 0.0,
            'imbalance_degree': 0.0,
            'server_proc_times': {s: 0.0 for s in server_list},
            'request_count': 0
        }

    base_time = min(entry['startTime'] for entry in log_entries)

    rel_start_times = [entry['startTime'] - base_time for entry in log_entries]
    wait_times = [entry['waitTime'] for entry in log_entries]
    execution_times = [entry['executionTime'] for entry in log_entries]
    finish_times = [entry['finishTime'] - base_time for entry in log_entries]

    avg_start_time = np.mean(rel_start_times)
    avg_wait_time = np.mean(wait_times)
    avg_execution_time = np.mean(execution_times)
    avg_finish_time = np.mean(finish_times)
    makespan = max(finish_times)

    server_proc_times = {s: 0.0 for s in server_list}
    for entry in log_entries:
        mips = entry.get('mips', 500)
        load = entry.get('load', entry['executionTime'] * mips)
        server_proc_times[entry['server']] += load / mips

    proc_values = list(server_proc_times.values())
    t_max = max(proc_values)
    t_min = min(proc_values)
    t_avg = np.mean(proc_values)
    imbalance_degree = (t_max - t_min) / t_avg if t_avg > 0 else 0

    return {
        'avg_start_time': avg_start_time,
        'avg_wait_time': avg_wait_time,
        'avg_execution_time': avg_execution_time,
        'avg_finish_time': avg_finish_time,
        'makespan': makespan,
        'imbalance_degree': imbalance_degree,
        'server_proc_times': server_proc_times,
        'request_count': len(log_entries)
    }

# results = {algo: analyze_log(entries) for algo, entries in logs_by_algo.items()}

# print("Perbandingan Performa per Algoritma:")
# print(f"{'Parameter':<25} {'SA':>15} {'HS':>15} {'SA-HS':>15} {'DALB':>15} {'DALEVY':>15} {'FPA':>15} {'RR':>15} {'ACO':>15}")
# print("-" * 90)

# def print_metric(label, key, unit="ms"):
#     values = [f"{results[algo][key]:.2f}" if results[algo] else "0.00" for algo in valid_algos]
#     print(f"{label:<25} {' '.join(f'{v:>15}' for v in values)} {unit}")

# print_metric("Average Start Time", "avg_start_time")
# print_metric("Average Wait Time", "avg_wait_time")
# print_metric("Average Execution Time", "avg_execution_time")
# print_metric("Average Finish Time", "avg_finish_time")
# print_metric("Makespan", "makespan")
# print_metric("Imbalance Degree", "imbalance_degree", unit="")

# print("\nJumlah Request per Algoritma:")
# for algo in valid_algos:
#     count = results[algo]['request_count']
#     print(f"{algo.upper():<10} {count:>15}")

# print("\nDistribusi Beban per Server (Processing Time, s):")
# print(f"{'Server':<20} {' '.join(f'{a.upper():>15}' for a in valid_algos)}")
# print("-" * 90)
# for server in server_list:
#     values = [f"{results[algo]['server_proc_times'][server]:.2f}" for algo in valid_algos]
#     print(f"{server:<20} {' '.join(f'{v:>15}' for v in values)}")

# Analisis hanya algoritma yang diminta
algos_to_print = [algo_arg] if algo_arg else valid_algos
results = {algo: analyze_log(logs_by_algo[algo]) for algo in algos_to_print}

# Header Dinamis
print("Perbandingan Performa per Algoritma:")
print(f"{'Parameter,':<25} {' '.join(f'{a.upper():>15}' for a in algos_to_print)}")
print("-" * (25 + 17 * len(algos_to_print)))

def print_metric(label, key, unit="ms"):
    values = [f"{results[algo][key]:.2f}" if results[algo] else "0.00" for algo in algos_to_print]
    print(f"{label:<25} {' '.join(f'{v:>15}' for v in values)} {unit}")

print_metric("Average Start Time,", "avg_start_time")
print_metric("Average Wait Time,", "avg_wait_time")
print_metric("Average Execution Time,", "avg_execution_time")
print_metric("Average Finish Time,", "avg_finish_time")
print_metric("Makespan,", "makespan")
print_metric("Imbalance Degree,", "imbalance_degree", unit="")

print("\nJumlah Request per Algoritma:")
for algo in algos_to_print:
    count = results[algo]['request_count']
    print(f"{algo.upper():<10} {count:>15}")

print("\nDistribusi Beban per Server (Processing Time, s):")
print(f"{'Server':<20} {' '.join(f'{a.upper():>15}' for a in algos_to_print)}")
print("-" * (20 + 17 * len(algos_to_print)))
for server in server_list:
    values = [f"{results[algo]['server_proc_times'][server]:.2f}" for algo in algos_to_print]
    print(f"{server:<20} {' '.join(f'{v:>15}' for v in values)}")

