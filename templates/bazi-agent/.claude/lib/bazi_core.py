#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
八字排盘核心计算引擎
BaZi Four Pillars Core Calculation Engine

This is the shared calculation library used by all BaZi skills.
Provides accurate Four Pillars calculation based on traditional Chinese astrology.
"""

import datetime
from typing import Dict, List, Tuple

class BaZiCalculator:
    """
    八字计算器 - 核心引擎
    
    Provides methods to calculate:
    - Year Pillar (年柱)
    - Month Pillar (月柱)
    - Day Pillar (日柱)
    - Hour Pillar (时柱)
    - Five Elements Balance (五行分布)
    - Hidden Stems (地支藏干)
    """
    
    def __init__(self):
        # 天干 (Heavenly Stems)
        self.heavenly_stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
        self.stem_elements = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水']

        # 地支 (Earthly Branches)
        self.earthly_branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
        self.branch_elements = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水']

        # 地支藏干 (Hidden Stems in Branches)
        self.hidden_stems = {
            '子': ['癸'],
            '丑': ['己', '癸', '辛'],
            '寅': ['甲', '丙', '戊'],
            '卯': ['乙'],
            '辰': ['戊', '乙', '癸'],
            '巳': ['丙', '庚', '戊'],
            '午': ['丁', '己'],
            '未': ['己', '丁', '乙'],
            '申': ['庚', '壬', '戊'],
            '酉': ['辛'],
            '戌': ['戊', '辛', '丁'],
            '亥': ['壬', '甲']
        }

        # 时辰对照表
        self.hour_branches = {
            (23, 1): '子', (1, 3): '丑', (3, 5): '寅', (5, 7): '卯',
            (7, 9): '辰', (9, 11): '巳', (11, 13): '午', (13, 15): '未',
            (15, 17): '申', (17, 19): '酉', (19, 21): '戌', (21, 23): '亥'
        }

    def get_year_pillar(self, year: int) -> Tuple[str, str]:
        """
        计算年柱 - 从1984年甲子年开始算
        Calculate Year Pillar from 1984 (Jia-Zi year)
        """
        # 1984年是甲子年 (天干0, 地支0)
        base_year = 1984
        stem_index = (year - base_year) % 10
        branch_index = (year - base_year) % 12
        return self.heavenly_stems[stem_index], self.earthly_branches[branch_index]

    def get_month_pillar(self, year: int, month: int) -> Tuple[str, str]:
        """
        计算月柱 - 基于节气
        Calculate Month Pillar based on solar terms (simplified)
        """
        # 简化版：基于公历月份推算
        # 实际应该基于节气，这里用近似算法
        year_stem_index = self.heavenly_stems.index(self.get_year_pillar(year)[0])

        # 正月建寅，各月地支固定
        month_branches = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑']

        # 月干公式：年干×2 + 月支序号
        if year_stem_index % 2 == 0:  # 甲己年
            month_stem_base = 2  # 丙
        else:  # 其他年份的计算
            month_stem_base = (year_stem_index * 2 + 2) % 10

        month_branch = month_branches[month - 1]
        branch_index = self.earthly_branches.index(month_branch)
        stem_index = (month_stem_base + branch_index) % 10

        return self.heavenly_stems[stem_index], month_branch

    def get_day_pillar(self, year: int, month: int, day: int) -> Tuple[str, str]:
        """
        计算日柱 - 使用基准日推算
        Calculate Day Pillar using base date calculation
        """
        # 使用1900年1月1日作为基准 (己亥日)
        base_date = datetime.date(1900, 1, 1)
        target_date = datetime.date(year, month, day)

        days_diff = (target_date - base_date).days

        # 1900年1月1日是己亥日 (天干5, 地支11)
        stem_index = (5 + days_diff) % 10
        branch_index = (11 + days_diff) % 12

        return self.heavenly_stems[stem_index], self.earthly_branches[branch_index]

    def get_hour_pillar(self, hour: int, day_stem: str) -> Tuple[str, str]:
        """
        计算时柱
        Calculate Hour Pillar
        """
        # 确定时支
        hour_branch = None
        for (start, end), branch in self.hour_branches.items():
            if start <= hour < end or (start > end and (hour >= start or hour < end)):
                hour_branch = branch
                break

        if not hour_branch:
            hour_branch = '巳'  # 默认巳时 (9-11点)

        # 时干公式：日干×2 + 时支序号
        day_stem_index = self.heavenly_stems.index(day_stem)
        branch_index = self.earthly_branches.index(hour_branch)

        if day_stem_index in [0, 5]:  # 甲己日
            hour_stem_base = 0  # 甲
        elif day_stem_index in [1, 6]:  # 乙庚日
            hour_stem_base = 2  # 丙
        elif day_stem_index in [2, 7]:  # 丙辛日
            hour_stem_base = 4  # 戊
        elif day_stem_index in [3, 8]:  # 丁壬日
            hour_stem_base = 6  # 庚
        else:  # 戊癸日
            hour_stem_base = 8  # 壬

        stem_index = (hour_stem_base + branch_index) % 10

        return self.heavenly_stems[stem_index], hour_branch

    def calculate_bazi(self, birth_date: str, birth_time: str, location: str = "北京") -> Dict:
        """
        计算完整八字
        Calculate complete BaZi Four Pillars
        
        Args:
            birth_date: 出生日期 "YYYY-MM-DD"
            birth_time: 出生时间 "HH:MM"
            location: 出生地点 (default: 北京)
            
        Returns:
            Dict containing:
            - birth_info: 出生信息
            - four_pillars: 四柱 (年月日时)
            - day_master: 日主
            - elements_balance: 五行分布
            - hidden_stems: 地支藏干
        """
        # 解析出生日期时间
        year, month, day = map(int, birth_date.split('-'))
        hour, minute = map(int, birth_time.split(':'))

        # 计算四柱
        year_pillar = self.get_year_pillar(year)
        month_pillar = self.get_month_pillar(year, month)
        day_pillar = self.get_day_pillar(year, month, day)
        hour_pillar = self.get_hour_pillar(hour, day_pillar[0])

        # 统计五行
        elements_count = {'木': 0, '火': 0, '土': 0, '金': 0, '水': 0}

        # 计算天干地支五行
        pillars = [year_pillar, month_pillar, day_pillar, hour_pillar]
        for stem, branch in pillars:
            stem_element = self.stem_elements[self.heavenly_stems.index(stem)]
            branch_element = self.branch_elements[self.earthly_branches.index(branch)]
            elements_count[stem_element] += 1
            elements_count[branch_element] += 1

        # 添加地支藏干
        for _, branch in pillars:
            for hidden_stem in self.hidden_stems[branch]:
                hidden_element = self.stem_elements[self.heavenly_stems.index(hidden_stem)]
                elements_count[hidden_element] += 0.5  # 藏干影响力较小

        return {
            'birth_info': {
                'gregorian': f"{year}年{month}月{day}日 {hour:02d}:{minute:02d}",
                'location': location
            },
            'four_pillars': {
                'year': {'stem': year_pillar[0], 'branch': year_pillar[1]},
                'month': {'stem': month_pillar[0], 'branch': month_pillar[1]},
                'day': {'stem': day_pillar[0], 'branch': day_pillar[1]},
                'hour': {'stem': hour_pillar[0], 'branch': hour_pillar[1]}
            },
            'day_master': {
                'stem': day_pillar[0],
                'element': self.stem_elements[self.heavenly_stems.index(day_pillar[0])]
            },
            'elements_balance': elements_count,
            'hidden_stems': {
                year_pillar[1]: self.hidden_stems[year_pillar[1]],
                month_pillar[1]: self.hidden_stems[month_pillar[1]],
                day_pillar[1]: self.hidden_stems[day_pillar[1]],
                hour_pillar[1]: self.hidden_stems[hour_pillar[1]]
            }
        }

# CLI support for standalone execution
if __name__ == "__main__":
    import sys
    import json
    
    if len(sys.argv) >= 3:
        birth_date = sys.argv[1]
        birth_time = sys.argv[2]
        location = sys.argv[3] if len(sys.argv) > 3 else "北京"
        
        calculator = BaZiCalculator()
        result = calculator.calculate_bazi(birth_date, birth_time, location)
        
        print("=" * 50)
        print("        八字排盘结果 (BaZi Chart)")
        print("=" * 50)
        print()
        print(f"出生信息：{result['birth_info']['gregorian']}")
        print(f"出生地点：{result['birth_info']['location']}")
        print()

        pillars = result['four_pillars']
        print("┌─────┬─────┬─────┬─────┐")
        print("│ 年柱 │ 月柱 │ 日柱 │ 时柱 │")
        print("├─────┼─────┼─────┼─────┤")
        print(f"│  {pillars['year']['stem']}  │  {pillars['month']['stem']}  │  {pillars['day']['stem']}  │  {pillars['hour']['stem']}  │")
        print("├─────┼─────┼─────┼─────┤")
        print(f"│  {pillars['year']['branch']}  │  {pillars['month']['branch']}  │  {pillars['day']['branch']}  │  {pillars['hour']['branch']}  │")
        print("└─────┴─────┴─────┴─────┘")
        print()

        day_master = result['day_master']
        print(f"日主：{day_master['stem']}{day_master['element']} (Day Master: {day_master['element']})")
        print()

        print("地支藏干 (Hidden Stems):")
        for branch, stems in result['hidden_stems'].items():
            print(f"  {branch}: {', '.join(stems)}")
        print()

        print("五行分布 (Five Elements Balance):")
        elements = result['elements_balance']
        for element, count in elements.items():
            print(f"  {element}: {count}")
        print()
        print("=" * 50)
        
        # Output JSON for programmatic use
        if "--json" in sys.argv:
            print("\n[JSON Output]")
            print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("Usage: python bazi_core.py <birth_date> <birth_time> [location] [--json]")
        print("Example: python bazi_core.py 1990-05-15 10:00 北京")
