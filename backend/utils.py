# from collections import deque

# import pandas as pd


class Utl:
    @staticmethod
    def to_list(v):
        return [v] if not isinstance(v, list) else v

    @staticmethod
    def flatten_list(nested, flat, remove_falsey=False):
        if isinstance(nested, list):
            for n in nested:
                Utl.flatten_list(n, flat)
        else:
            if remove_falsey:
                if nested:
                    flat.append(nested)
            else:
                flat.append(nested)
        return flat

    @staticmethod
    def split_list(dict_list, chunk, new_list=[]):
        if len(dict_list) > 0:
            new_list.append(dict_list[:chunk])

        if len(dict_list) >= chunk:
            dict_list = dict_list[chunk:]
            return Utl.split_list(dict_list, chunk)

        return new_list
